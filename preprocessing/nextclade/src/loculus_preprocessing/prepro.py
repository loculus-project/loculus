import logging
import time
from collections import defaultdict
from collections.abc import Sequence
from tempfile import TemporaryDirectory
from typing import Any

import dpath

from .backend import (
    download_minimizer,
    fetch_unprocessed_sequences,
    request_upload,
    submit_processed_sequences,
    upload_embl_file_to_presigned_url,
)
from .config import AlignmentRequirement, Config
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
    ProcessingSpec,
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
    process_frameshifts,
    process_stop_codons,
)
from .sequence_checks import errors_if_non_iupac

logger = logging.getLogger(__name__)


def accession_from_str(id_str: AccessionVersion) -> str:
    return id_str.split(".")[0]


def version_from_str(id_str: AccessionVersion) -> int:
    return int(id_str.split(".")[1])


def null_per_backend(x: Any) -> bool:
    match x:
        case None:
            return True
        case "":
            return True
        case _:
            return False


class MultipleValidSegmentsError(Exception):
    def __init__(self, segments: list[str]):
        self.segments = segments
        super().__init__()

    def getProcessingAnnotation(
        self, processed_field_name: str, organism: str
    ) -> ProcessingAnnotation:
        return ProcessingAnnotation(
            unprocessedFields=[
                AnnotationSource(name=segment, type=AnnotationSourceType.NUCLEOTIDE_SEQUENCE)
                for segment in self.segments
            ],
            processedFields=[
                AnnotationSource(name=processed_field_name, type=AnnotationSourceType.METADATA)
            ],
            message=f"Organism {organism} is configured to only accept one segment per submission, found multiple valid segments: {self.segments}.",
        )


def get_segment(
    spec: ProcessingSpec, data_per_segment: dict[SegmentName, Any] | None
) -> str | None:
    """Returns the segment to use based on spec args"""
    if spec.args and spec.args.get("useFirstSegment", False) and data_per_segment:
        valid_segments = [key for key, value in data_per_segment.items() if value]
        if not valid_segments:
            return None
        if len(valid_segments) > 1:
            raise MultipleValidSegmentsError(valid_segments)
        return valid_segments[0]

    if spec.args and "segment" in spec.args:
        return str(spec.args["segment"])

    return "main"


def add_nextclade_metadata(
    spec: ProcessingSpec,
    unprocessed: UnprocessedAfterNextclade,
    nextclade_path: str,
    config: Config,
) -> InputData:
    try:
        segment = get_segment(spec, unprocessed.nextcladeMetadata)
    except MultipleValidSegmentsError as e:
        error_annotation = e.getProcessingAnnotation(
            processed_field_name=nextclade_path, organism=config.organism
        )
        logger.error(error_annotation.message)
        return InputData(datum=None, errors=[error_annotation])

    if (
        not unprocessed.nextcladeMetadata
        or segment not in unprocessed.nextcladeMetadata
        or unprocessed.nextcladeMetadata[segment] is None
    ):
        return InputData(datum=None)

    raw: str | None = dpath.get(
        unprocessed.nextcladeMetadata[segment],
        nextclade_path,
        separator=".",
        default=None,
    )  # type: ignore[assignment]

    match nextclade_path:
        case "frameShifts":
            return process_frameshifts(raw)
        case "qc.stopCodons.stopCodons":
            return process_stop_codons(raw)
        case _:
            return InputData(datum=str(raw))


def add_assigned_segment(
    unprocessed: UnprocessedAfterNextclade,
    config: Config,
) -> InputData:
    if not unprocessed.nextcladeMetadata:
        return InputData(datum=None)
    valid_segments = [key for key, value in unprocessed.nextcladeMetadata.items() if value]
    if not valid_segments:
        return InputData(datum=None)
    if len(valid_segments) > 1:
        return InputData(
            datum=None,
            errors=[
                MultipleValidSegmentsError(valid_segments).getProcessingAnnotation(
                    processed_field_name="ASSIGNED_SEGMENT", organism=config.organism
                )
            ],
        )
    return InputData(datum=valid_segments[0])


def add_input_metadata(
    spec: ProcessingSpec,
    unprocessed: UnprocessedAfterNextclade,
    input_path: str,
    config: Config,
) -> InputData:
    """Returns value of input_path in unprocessed metadata"""
    # If field starts with "nextclade.", take from nextclade metadata
    if input_path == "ASSIGNED_SEGMENT":
        return add_assigned_segment(unprocessed, config=config)
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
    submitter: str | None,
    submitted_at: str | None,
    input_data: InputMetadata,
    input_fields: list[str],
) -> ProcessingResult:
    args = dict(spec.args)
    args["submitter"] = submitter
    args["submittedAt"] = submitted_at
    args["accession_version"] = accession_version

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


def processed_entry_no_alignment(
    accession_version: AccessionVersion,
    unprocessed: UnprocessedData,
    output_metadata: ProcessedMetadata,
    errors: list[ProcessingAnnotation],
    warnings: list[ProcessingAnnotation],
    sequenceNameToFastaId: dict[SegmentName, str],
) -> SubmissionData:
    """Process a single sequence without alignment"""

    aligned_nucleotide_sequences: dict[SegmentName, NucleotideSequence | None] = {}
    aligned_aminoacid_sequences: dict[GeneName, AminoAcidSequence | None] = {}
    nucleotide_insertions: dict[SegmentName, list[NucleotideInsertion]] = {}
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
    segment: SegmentName | None,
) -> int:
    if segment is None:
        return 0
    sequence = unaligned_nucleotide_sequences.get(segment)
    return len(sequence) if sequence else 0


def get_output_metadata(
    accession_version: AccessionVersion,
    unprocessed: UnprocessedData | UnprocessedAfterNextclade,
    config: Config,
) -> tuple[ProcessedMetadata, list[ProcessingAnnotation], list[ProcessingAnnotation]]:
    errors: list[ProcessingAnnotation] = []
    warnings: list[ProcessingAnnotation] = []
    output_metadata: ProcessedMetadata = {}

    for output_field, spec_dict in config.processing_spec.items():
        spec = ProcessingSpec(
            inputs=spec_dict["inputs"],
            function=spec_dict["function"],
            required=spec_dict.get("required", False),
            args=spec_dict.get("args", {}),
        )
        spec.args = {} if spec.args is None else spec.args
        input_data: InputMetadata = {}
        input_fields: list[str] = []
        if output_field == "length":
            try:
                segment_name = get_segment(spec, unprocessed.unalignedNucleotideSequences)
            except MultipleValidSegmentsError as e:
                error_annotation = e.getProcessingAnnotation(
                    processed_field_name=output_field, organism=config.organism
                )
                logger.error(error_annotation.message)
                output_metadata[output_field] = None
                continue

            output_metadata[output_field] = get_sequence_length(
                unprocessed.unalignedNucleotideSequences, segment_name
            )
            continue

        if output_field.startswith("length_") and output_field[7:] in [
            seq.name for seq in config.nextclade_sequence_and_datasets
        ]:
            segment = output_field[7:]
            output_metadata[output_field] = get_sequence_length(
                unprocessed.unalignedNucleotideSequences, segment
            )
            continue

        for arg_name, input_path in spec.inputs.items():
            if isinstance(unprocessed, UnprocessedAfterNextclade):
                input_metadata = add_input_metadata(spec, unprocessed, input_path, config=config)
                input_data[arg_name] = input_metadata.datum
                errors.extend(input_metadata.errors)
                warnings.extend(input_metadata.warnings)
                input_fields.append(input_path)
                submitter = unprocessed.inputMetadata["submitter"]
                submitted_at = unprocessed.inputMetadata["submittedAt"]
            else:
                input_data[arg_name] = unprocessed.metadata.get(input_path)
                input_fields.append(input_path)
                submitter = unprocessed.submitter
                submitted_at = unprocessed.submittedAt

        processing_result = _call_processing_function(
            accession_version=accession_version,
            spec=spec,
            output_field=output_field,
            submitter=submitter,
            submitted_at=submitted_at,
            input_data=input_data,
            input_fields=input_fields,
        )

        output_metadata[output_field] = processing_result.datum
        errors.extend(processing_result.errors)
        warnings.extend(processing_result.warnings)
        if (
            null_per_backend(processing_result.datum)
            and spec.required
            and submitter != "insdc_ingest_user"
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
    aligned_segments = set()
    for sequence_and_dataset in config.nextclade_sequence_and_datasets:
        segment = sequence_and_dataset.name
        if segment not in unprocessed.unalignedNucleotideSequences:
            continue
        if unprocessed.nextcladeMetadata and (
            segment not in unprocessed.nextcladeMetadata
            or (unprocessed.nextcladeMetadata[segment] is None)
        ):
            message = (
                "Nucleotide sequence failed to align"
                if not config.multi_segment
                else f"Nucleotide sequence for {segment} failed to align"
            )
            annotation = ProcessingAnnotation.from_single(
                segment, AnnotationSourceType.NUCLEOTIDE_SEQUENCE, message=message
            )
            if config.multi_segment and config.alignment_requirement == AlignmentRequirement.ANY:
                warnings.append(annotation)
            else:
                errors.append(annotation)
            continue
        aligned_segments.add(segment)

    if (
        not aligned_segments
        and unprocessed.unalignedNucleotideSequences
        and config.multi_segment
        and config.alignment_requirement == AlignmentRequirement.ANY
    ):
        errors.append(
            ProcessingAnnotation.from_single(
                ProcessingAnnotationAlignment,
                AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                message="No segment aligned.",
            )
        )
    return (errors, warnings)


def unpack_annotations(config, nextclade_metadata: dict[str, Any] | None) -> dict[str, Any] | None:
    if not config.create_embl_file or not nextclade_metadata:
        return None
    annotations: dict[str, Any] = {}
    for sequence_and_dataset in config.nextclade_sequence_and_datasets:
        segment = sequence_and_dataset.name
        if segment in nextclade_metadata:
            annotations[segment] = None
            if nextclade_metadata[segment]:
                annotations[segment] = nextclade_metadata[segment].get("annotation", None)
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


def run(config: Config) -> None:
    with TemporaryDirectory(delete=not config.keep_tmp_dir) as dataset_dir:
        if config.alignment_requirement != AlignmentRequirement.NONE:
            download_nextclade_dataset(dataset_dir, config)
        if (
            config.minimizer_url
            or config.segment_classification_method == SegmentClassificationMethod.MINIMIZER
            or config.require_nextclade_sort_match
        ):
            download_minimizer(config, dataset_dir + "/minimizer/minimizer.json")
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
