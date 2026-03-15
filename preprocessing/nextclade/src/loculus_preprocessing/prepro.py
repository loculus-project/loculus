import logging
import time
from collections import defaultdict
from collections.abc import Sequence
from tempfile import TemporaryDirectory
from typing import Any

import dpath

from .backend import (
    download_diamond_db,
    download_minimizer,
    fetch_unprocessed_sequences,
    request_upload,
    submit_processed_sequences,
    upload_embl_file_to_presigned_url,
)
from .config import AlignmentRequirement, Config, ProcessingSpec, SequenceName
from .datatypes import (
    AccessionVersion,
    AminoAcidInsertion,
    AminoAcidSequence,
    AnnotationSource,
    AnnotationSourceType,
    FileIdAndName,
    GeneName,
    InputData,
    InputMetadata,
    NucleotideInsertion,
    NucleotideSequence,
    ProcessedData,
    ProcessedEntry,
    ProcessedMetadata,
    ProcessedMetadataValue,
    ProcessingAnnotation,
    ProcessingAnnotationAlignment,
    ProcessingResult,
    SegmentClassificationMethod,
    SegmentName,
    SubmissionData,
    UnprocessedAfterNextclade,
    UnprocessedData,
    UnprocessedEntry,
)
from .embl import create_flatfile
from .nextclade import (
    assign_segment_using_header,
    download_nextclade_dataset,
    enrich_with_nextclade,
)
from .processing_functions import (
    ProcessingFunctions,
    null_per_backend,
    process_frameshifts,
    process_labeled_mutations,
    process_mutations_from_clade_founder,
    process_phenotype_values,
    process_stop_codons,
)
from .sequence_checks import errors_if_non_iupac

logger = logging.getLogger(__name__)


def accession_from_str(id_str: AccessionVersion) -> str:
    return id_str.split(".")[0]


def version_from_str(id_str: AccessionVersion) -> int:
    return int(id_str.split(".")[1])


class MultipleSequencesPerSegmentError(Exception):
    def __init__(self, references: list[str]):
        self.references = references
        super().__init__()

    def get_processing_annotation(
        self, processed_field_name: str, organism: str
    ) -> ProcessingAnnotation:
        return ProcessingAnnotation(
            unprocessedFields=[
                AnnotationSource(name=reference, type=AnnotationSourceType.NUCLEOTIDE_SEQUENCE)
                for reference in self.references
            ],
            processedFields=[
                AnnotationSource(name=processed_field_name, type=AnnotationSourceType.METADATA)
            ],
            message=(
                f"Organism {organism} is configured to only accept one sequence per segment, "
                f"found multiple valid sequences: {self.references}."
            ),
        )


def get_dataset_name(
    segment: SegmentName,
    data_per_dataset: dict[SequenceName, Any] | None,
    config: Config,
    reference: str | None = None,
) -> str | None:
    """Returns the name of the dataset to use based on spec args"""
    valid_datasets = (
        [key for key, value in data_per_dataset.items() if value] if data_per_dataset else []
    )
    lapis_names = [
        dataset
        for dataset in valid_datasets
        if config.get_dataset_by_name(dataset).segment == segment
    ]
    if reference is not None:
        lapis_names = [
            dataset
            for dataset in lapis_names
            if config.get_dataset_by_name(dataset).reference_name == reference
        ]
    if not lapis_names:
        return None
    if len(lapis_names) > 1:
        raise MultipleSequencesPerSegmentError(lapis_names)
    return lapis_names[0]


def truncate_after_wildcard(path: str, separator: str = ".") -> str:
    parts = path.split(separator)
    if "*" in parts:
        return separator.join(parts[: parts.index("*")])
    return path


def add_nextclade_metadata(
    spec: ProcessingSpec,
    unprocessed: UnprocessedAfterNextclade,
    nextclade_path: str,
    config: Config,
) -> InputData:
    try:
        segment = spec.args.get("segment", "main") if spec.args else "main"
        if not isinstance(segment, str):
            msg = f"add_nextclade_metadata: segment must be str, got {type(segment)}"
            raise TypeError(msg)
        reference = spec.args.get("reference", None) if spec.args else None
        if not isinstance(reference, str) and reference is not None:
            msg = f"add_nextclade_metadata: reference must be str, got {type(reference)}"
            raise TypeError(msg)
        sequence_name = get_dataset_name(
            segment,
            unprocessed.nextcladeMetadata,
            config,
            reference,
        )
    except MultipleSequencesPerSegmentError as e:
        error_annotation = e.get_processing_annotation(
            processed_field_name=nextclade_path, organism=config.organism
        )
        logger.error(error_annotation.message)
        return InputData(datum=None, errors=[error_annotation])

    if (
        not unprocessed.nextcladeMetadata
        or sequence_name not in unprocessed.nextcladeMetadata
        or unprocessed.nextcladeMetadata[sequence_name] is None
    ):
        return InputData(datum=None)

    raw: str | None = dpath.get(
        unprocessed.nextcladeMetadata[sequence_name],
        truncate_after_wildcard(nextclade_path),
        separator=".",
        default=None,
    )  # type: ignore[assignment]

    match nextclade_path:
        case "frameShifts":
            result = None if raw is None else str(raw)
            return process_frameshifts(result)
        case "qc.stopCodons.stopCodons":
            result = None if raw is None else str(raw)
            return process_stop_codons(result)
        case "phenotypeValues":
            result = None if raw is None else str(raw)
            return process_phenotype_values(result, spec.args)
        case "cladeFounderInfo.aaMutations.*.privateSubstitutions":
            result = None if raw is None else str(raw)
            return process_mutations_from_clade_founder(result, spec.args)
        case "privateAaMutations.*.labeledSubstitutions.substitution":
            result = None if raw is None else str(raw)
            return process_labeled_mutations(result, spec.args)
        case _:
            return InputData(datum=str(raw))


def add_assigned_reference(
    spec: ProcessingSpec,
    unprocessed: UnprocessedAfterNextclade,
    config: Config,
) -> InputData:
    if not unprocessed.nextcladeMetadata:
        return InputData(datum=None)
    segment = spec.args.get("segment", "main") if spec.args else "main"
    if not isinstance(segment, str):
        msg = f"add_assigned_reference: segment must be str, got {type(segment)}"
        raise TypeError(msg)
    name = get_dataset_name(segment, unprocessed.nextcladeMetadata, config)
    if not name:
        return InputData(datum=None)
    reference = config.get_dataset_by_name(name).reference_name
    if not reference:
        return InputData(datum=None)
    return InputData(datum=reference)


def add_input_metadata(
    spec: ProcessingSpec,
    unprocessed: UnprocessedAfterNextclade,
    input_path: str,
    config: Config,
) -> InputData:
    """Returns value of input_path in unprocessed metadata"""
    if input_path.startswith("ASSIGNED_REFERENCE"):
        return add_assigned_reference(spec, unprocessed, config=config)
    # If field starts with "nextclade.", take from nextclade metadata
    nextclade_prefix = "nextclade."
    if input_path.startswith(nextclade_prefix):
        nextclade_path = input_path[len(nextclade_prefix) :]
        return add_nextclade_metadata(spec, unprocessed, nextclade_path, config=config)
    if input_path not in unprocessed.inputMetadata:
        return InputData(datum=None)
    return InputData(datum=unprocessed.inputMetadata[input_path])


def _call_processing_function(  # noqa: PLR0913, PLR0917
    accession_version: AccessionVersion,
    spec: ProcessingSpec,
    output_field: str,
    group_id: int | None,
    submitted_at: str | None,
    input_data: InputMetadata,
    input_fields: list[str],
    config: Config,
) -> ProcessingResult:
    args = dict(spec.args) if spec.args else {}
    args["is_insdc_ingest_group"] = config.insdc_ingest_group_id == group_id
    args["submittedAt"] = submitted_at
    args["ACCESSION_VERSION"] = accession_version

    try:
        processing_result = ProcessingFunctions.call_function(
            spec.function,
            args,
            input_data,
            output_field,
            input_fields,
        )
    except Exception as e:
        msg = f"Processing for spec: {spec} with input data: {input_data} failed with {e}"
        raise RuntimeError(msg) from e

    return processing_result


def processed_entry_no_alignment(  # noqa: PLR0913, PLR0917
    accession_version: AccessionVersion,
    unprocessed: UnprocessedData,
    output_metadata: ProcessedMetadata,
    errors: list[ProcessingAnnotation],
    warnings: list[ProcessingAnnotation],
    sequenceNameToFastaId: dict[SequenceName, str],  # noqa: N803
) -> SubmissionData:
    """Process a single sequence without alignment"""

    aligned_nucleotide_sequences: dict[SequenceName, NucleotideSequence | None] = {}
    aligned_aminoacid_sequences: dict[GeneName, AminoAcidSequence | None] = {}
    nucleotide_insertions: dict[SequenceName, list[NucleotideInsertion]] = {}
    amino_acid_insertions: dict[GeneName, list[AminoAcidInsertion]] = {}

    return SubmissionData(
        processed_entry=ProcessedEntry(
            accession=accession_from_str(accession_version),
            version=version_from_str(accession_version),
            data=ProcessedData(
                metadata=output_metadata,
                unalignedNucleotideSequences=unprocessed.unalignedNucleotideSequences,
                alignedNucleotideSequences=aligned_nucleotide_sequences,
                nucleotideInsertions=nucleotide_insertions,
                alignedAminoAcidSequences=aligned_aminoacid_sequences,
                aminoAcidInsertions=amino_acid_insertions,
                sequenceNameToFastaId=sequenceNameToFastaId,
            ),
            errors=errors,
            warnings=warnings,
        ),
        submitter=unprocessed.submitter,
    )


def get_sequence_length(
    unaligned_nucleotide_sequences: dict[SegmentName, NucleotideSequence | None],
    name: SequenceName | None,
) -> int:
    if name is None:
        return 0
    sequence = unaligned_nucleotide_sequences.get(name)
    return len(sequence) if sequence else 0


def get_output_metadata(
    accession_version: AccessionVersion,
    unprocessed: UnprocessedData | UnprocessedAfterNextclade,
    config: Config,
) -> tuple[ProcessedMetadata, list[ProcessingAnnotation], list[ProcessingAnnotation]]:
    errors: list[ProcessingAnnotation] = []
    warnings: list[ProcessingAnnotation] = []
    output_metadata: ProcessedMetadata = {}

    for output_field, spec in config.processing_spec.items():
        input_data: InputMetadata = {}
        input_fields: list[str] = []
        if output_field == "length":
            try:
                segment = spec.args.get("segment", "main") if spec.args else "main"
                if not isinstance(segment, str):
                    msg = f"get_output_metadata: segment must be str, got {type(segment)}"
                    raise TypeError(msg)
                sequence_name = get_dataset_name(
                    segment, unprocessed.unalignedNucleotideSequences, config
                )
            except MultipleSequencesPerSegmentError as e:
                error_annotation = e.get_processing_annotation(
                    processed_field_name=output_field, organism=config.organism
                )
                logger.error(error_annotation.message)
                output_metadata[output_field] = None
                continue

            output_metadata[output_field] = get_sequence_length(
                unprocessed.unalignedNucleotideSequences, sequence_name
            )
            continue

        if output_field.startswith("length_"):
            sequence_name = get_dataset_name(
                output_field[7:], unprocessed.unalignedNucleotideSequences, config
            )
            output_metadata[output_field] = get_sequence_length(
                unprocessed.unalignedNucleotideSequences, sequence_name
            )
            continue

        for arg_name, input_path in spec.inputs.items():
            if isinstance(unprocessed, UnprocessedAfterNextclade):
                input_metadata = add_input_metadata(spec, unprocessed, input_path, config=config)
                input_data[arg_name] = input_metadata.datum
                errors.extend(input_metadata.errors)
                warnings.extend(input_metadata.warnings)
                input_fields.append(input_path)
                group_id = (
                    int(unprocessed.inputMetadata["group_id"])
                    if unprocessed.inputMetadata["group_id"]
                    else None
                )
                submitted_at = unprocessed.inputMetadata["submittedAt"]
            else:
                input_data[arg_name] = unprocessed.metadata.get(input_path)
                input_fields.append(input_path)
                group_id = unprocessed.group_id
                submitted_at = unprocessed.submittedAt

        processing_result = _call_processing_function(
            accession_version=accession_version,
            spec=spec,
            output_field=output_field,
            group_id=group_id,
            submitted_at=submitted_at,
            input_data=input_data,
            input_fields=input_fields,
            config=config,
        )

        output_metadata[output_field] = processing_result.datum
        errors.extend(processing_result.errors)
        warnings.extend(processing_result.warnings)
        if (
            null_per_backend(processing_result.datum)
            and spec.required
            and group_id != config.insdc_ingest_group_id
        ):
            errors.append(
                ProcessingAnnotation.from_fields(
                    spec.inputs.values(),
                    [output_field],
                    AnnotationSourceType.METADATA,
                    message=f"Metadata field {output_field} is required.",
                )
            )
    logger.debug(f"Processed {accession_version}: {output_metadata}")
    return output_metadata, errors, warnings


def alignment_errors_warnings(
    unprocessed: UnprocessedAfterNextclade,
    config: Config,
) -> tuple[list[ProcessingAnnotation], list[ProcessingAnnotation]]:
    errors: list[ProcessingAnnotation] = []
    warnings: list[ProcessingAnnotation] = []
    if not unprocessed.nextcladeMetadata and unprocessed.unalignedNucleotideSequences:
        message = (
            "An unknown internal error occurred while aligning sequences, "
            "please contact the administrator."
        )
        errors.append(
            ProcessingAnnotation.from_single(
                ProcessingAnnotationAlignment,
                AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                message=message,
            )
        )
        return (errors, warnings)
    aligned_sequences = set()
    for sequence_and_dataset in config.nextclade_sequence_and_datasets:
        name = sequence_and_dataset.name
        if name not in unprocessed.unalignedNucleotideSequences:
            continue
        if unprocessed.nextcladeMetadata and (
            name not in unprocessed.nextcladeMetadata
            or (unprocessed.nextcladeMetadata[name] is None)
        ):
            message = (
                "Nucleotide sequence failed to align"
                if not config.multi_datasets
                else f"Nucleotide sequence for {name} failed to align"
            )
            annotation = ProcessingAnnotation.from_single(
                name, AnnotationSourceType.NUCLEOTIDE_SEQUENCE, message=message
            )
            if config.multi_datasets and config.alignment_requirement == AlignmentRequirement.ANY:
                warnings.append(annotation)
            else:
                errors.append(annotation)
            continue
        aligned_sequences.add(name)

    if (
        not aligned_sequences
        and unprocessed.unalignedNucleotideSequences
        and config.multi_datasets
        and config.alignment_requirement == AlignmentRequirement.ANY
    ):
        errors.append(
            ProcessingAnnotation.from_single(
                ProcessingAnnotationAlignment,
                AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                message="No sequence aligned.",
            )
        )
    return (errors, warnings)


def unpack_annotations(config, nextclade_metadata: dict[str, Any] | None) -> dict[str, Any] | None:
    if not config.create_embl_file or not nextclade_metadata:
        return None
    annotations: dict[SequenceName, Any] = {}
    for sequence_and_dataset in config.nextclade_sequence_and_datasets:
        name = sequence_and_dataset.name
        if name in nextclade_metadata:
            annotations[name] = None
            if nextclade_metadata[name]:
                annotations[name] = nextclade_metadata[name].get("annotation", None)
    return annotations


def process_single(
    accession_version: AccessionVersion,
    unprocessed: UnprocessedAfterNextclade,
    config: Config,
) -> SubmissionData:
    """Process a single sequence per config"""
    iupac_errors = errors_if_non_iupac(unprocessed.unalignedNucleotideSequences)

    alignment_errors, alignment_warnings = alignment_errors_warnings(
        unprocessed,
        config,
    )

    output_metadata, metadata_errors, metadata_warnings = get_output_metadata(
        accession_version, unprocessed, config
    )

    processed_entry = ProcessedEntry(
        accession=accession_from_str(accession_version),
        version=version_from_str(accession_version),
        data=ProcessedData(
            metadata=output_metadata,
            unalignedNucleotideSequences=unprocessed.unalignedNucleotideSequences,
            alignedNucleotideSequences=unprocessed.alignedNucleotideSequences,
            nucleotideInsertions=unprocessed.nucleotideInsertions,
            alignedAminoAcidSequences=unprocessed.alignedAminoAcidSequences,
            aminoAcidInsertions=unprocessed.aminoAcidInsertions,
            sequenceNameToFastaId=unprocessed.sequenceNameToFastaId,
        ),
        errors=list(set(unprocessed.errors + iupac_errors + alignment_errors + metadata_errors)),
        warnings=list(set(unprocessed.warnings + alignment_warnings + metadata_warnings)),
    )

    return SubmissionData(
        processed_entry=processed_entry,
        annotations=unpack_annotations(config, unprocessed.nextcladeMetadata),
        group_id=int(str(unprocessed.inputMetadata["group_id"])),
        submitter=str(unprocessed.inputMetadata["submitter"]),
    )


def process_single_unaligned(
    accession_version: AccessionVersion,
    unprocessed: UnprocessedData,
    config: Config,
) -> SubmissionData:
    """Process a single sequence per config"""
    segment_assignment = assign_segment_using_header(
        input_unaligned_sequences=unprocessed.unalignedNucleotideSequences,
        config=config,
    )
    unprocessed.unalignedNucleotideSequences = segment_assignment.unalignedNucleotideSequences
    iupac_errors = errors_if_non_iupac(unprocessed.unalignedNucleotideSequences)

    output_metadata, metadata_errors, metadata_warnings = get_output_metadata(
        accession_version, unprocessed, config
    )

    return processed_entry_no_alignment(
        accession_version=accession_version,
        unprocessed=unprocessed,
        output_metadata=output_metadata,
        errors=list(set(iupac_errors + metadata_errors + segment_assignment.alert.errors)),
        warnings=list(set(metadata_warnings)),
        sequenceNameToFastaId=segment_assignment.sequenceNameToFastaId,
    )


def processed_entry_with_errors(id) -> SubmissionData:
    return SubmissionData(
        processed_entry=ProcessedEntry(
            accession=accession_from_str(id),
            version=version_from_str(id),
            data=ProcessedData(
                metadata=dict[str, ProcessedMetadataValue](),
                unalignedNucleotideSequences=defaultdict(dict[str, Any]),
                alignedNucleotideSequences=defaultdict(dict[str, Any]),
                nucleotideInsertions=defaultdict(dict[str, Any]),
                alignedAminoAcidSequences=defaultdict(dict[str, Any]),
                aminoAcidInsertions=defaultdict(dict[str, Any]),
                sequenceNameToFastaId=defaultdict(str),
            ),
            errors=[
                ProcessingAnnotation.from_single(
                    "unknown",
                    AnnotationSourceType.METADATA,
                    message=(
                        f"Failed to process submission with id: {id} - please review your "
                        "submission or reach out to an administrator if this error persists."
                    ),
                ),
            ],
            warnings=[],
        ),
        submitter=None,
    )


def process_all(
    unprocessed: Sequence[UnprocessedEntry], dataset_dir: str, config: Config
) -> Sequence[SubmissionData]:
    processed_results = []
    logger.debug(f"Processing {len(unprocessed)} unprocessed sequences")
    if config.alignment_requirement != AlignmentRequirement.NONE:
        nextclade_results = enrich_with_nextclade(unprocessed, dataset_dir, config)
        for id, result in nextclade_results.items():
            try:
                processed_single = process_single(id, result, config)
            except Exception as e:
                logger.error(f"Processing failed for {id} with error: {e}")
                processed_single = processed_entry_with_errors(id)
            processed_results.append(processed_single)
    else:
        for entry in unprocessed:
            try:
                processed_single = process_single_unaligned(
                    entry.accessionVersion, entry.data, config
                )
            except Exception as e:
                logger.error(f"Processing failed for {entry.accessionVersion} with error: {e}")
                processed_single = processed_entry_with_errors(entry.accessionVersion)
            processed_results.append(processed_single)

    return processed_results


def upload_flatfiles(processed: Sequence[SubmissionData], config: Config) -> None:
    for submission_data in processed:
        accession = submission_data.processed_entry.accession
        version = submission_data.processed_entry.version
        try:
            if submission_data.group_id is None:
                msg = "Group ID is required for EMBL file upload"
                raise ValueError(msg)
            file_content = create_flatfile(config, submission_data)
            file_name = f"{accession}.{version}.embl"
            upload_info = request_upload(submission_data.group_id, 1, config)[0]
            file_id = upload_info.fileId
            url = upload_info.url
            upload_embl_file_to_presigned_url(file_content, url)
            submission_data.processed_entry.data.files = {
                "annotations": [FileIdAndName(fileId=file_id, name=file_name)]
            }
        except Exception as e:
            logger.error("Error creating or uploading EMBL file: %s", e)
            submission_data.processed_entry.errors.append(
                ProcessingAnnotation(
                    unprocessedFields=[
                        AnnotationSource(name="embl_upload", type=AnnotationSourceType.METADATA)
                    ],
                    processedFields=[
                        AnnotationSource(name="embl_upload", type=AnnotationSourceType.METADATA)
                    ],
                    message="Failed to create or upload EMBL file. "
                    "Please contact your administrator.",
                )
            )


def run(config: Config) -> None:  # noqa: C901
    with TemporaryDirectory(delete=not config.keep_tmp_dir) as dataset_dir:
        if config.alignment_requirement != AlignmentRequirement.NONE:
            download_nextclade_dataset(dataset_dir, config)
        if (
            config.segment_classification_method == SegmentClassificationMethod.MINIMIZER
            or config.require_nextclade_sort_match
        ):
            download_minimizer(config, dataset_dir + "/minimizer/minimizer.json")
        if config.segment_classification_method == SegmentClassificationMethod.DIAMOND:
            if not config.diamond_dmnd_url:
                msg = "Diamond database URL must be provided for diamond segment classification"
                raise ValueError(msg)
            download_diamond_db(config, dataset_dir + "/diamond/diamond.dmnd")
        total_processed = 0
        etag = None
        last_force_refresh = time.time()
        while True:
            logger.debug("Fetching unprocessed sequences")
            # Reset etag every hour just in case
            if last_force_refresh + 3600 < time.time():
                etag = None
                last_force_refresh = time.time()
            etag, unprocessed = fetch_unprocessed_sequences(etag, config)
            if not unprocessed:
                # sleep 1 sec and try again
                logger.debug("No unprocessed sequences found. Sleeping for 1 second.")
                time.sleep(1)
                continue
            # Don't use etag if we just got data
            # preprocessing only asks for 100 sequences to process at a time, so there might be more
            etag = None
            try:
                processed = process_all(unprocessed, dataset_dir, config)
            except Exception as e:
                logger.exception(
                    f"Processing failed. Traceback : {e}. Unprocessed data: {unprocessed}"
                )
                continue

            if config.create_embl_file:
                upload_flatfiles(processed, config)

            try:
                processed_entries = [
                    submission_data.processed_entry for submission_data in processed
                ]
                submit_processed_sequences(processed_entries, dataset_dir, config)
            except RuntimeError as e:
                logger.exception("Submitting processed data failed. Traceback : %s", e)
                continue
            total_processed += len(processed)
            logger.info("Processed %s sequences", len(processed))
