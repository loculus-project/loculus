# ruff: noqa: PLR2004, PLR0913, PLR0917, PLR0914, S311, C901
"""select_changed_records replaces a chain of scripts for non-segmented organisms; these tests check
that it produces what the chain produces"""

import csv
import dataclasses
import io
import json
import random
import sys
from pathlib import Path

import orjson
import pytest
import yaml
from click.testing import CliRunner
from compression import zstd

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))

import calculate_sequence_hashes
import compare_hashes
import filter_out_depositions
import format_ncbi_metadata
import prepare_files
import prepare_metadata
import select_changed_records
from compare_hashes import LatestLoculusVersion

INGEST_DIR = Path(__file__).parents[1]
DATA_REPORT = INGEST_DIR / "tests" / "test_data_non_segmented" / "data_report.jsonl"


# --- the FASTA parser ------------------------------------------------------------------------


def text_mode_records(data: bytes) -> list[tuple[str, str]]:
    """What calculate_sequence_hashes reads from a file with these bytes"""
    text = io.TextIOWrapper(io.BytesIO(data), encoding="utf-8")  # universal newlines, like open()
    return list(calculate_sequence_hashes.fasta_records(text))


FASTA_CASES = {
    "wrapped": b">A.1 some description\nACGT\nAC\n>B.1\nGG\nTT\n",
    "unwrapped, no final newline": b">A.1\nACGT\n>B.1\nGGTT",
    "spaces and tabs": b">A.1  x\nAC GT\nA\tC\n",
    "crlf": b">A.1 x\r\nACGT\r\nAC\r\n>B.1\r\nGG\r\n",
    "lone cr in sequence": b">A.1\nAC\rGT\n>B.1\nGG\n",
    "lone cr in header": b">A.1 desc\rACGT\nTT\n>B.1\nGG\n",
    "record starting after a lone cr": b">A.1\nACGT\r>B.1\nGG\n",
    "text before the first record": b"junk\nmore\n>A.1\nAC\n",
    "text with cr before the first record": b"junk\r>A.1\nAC\n>B.1\nG\n",
    "empty title and empty record": b">\nAC\n>B.1\n>C.1\nG\n",
    "repeated id": b">A.1\nAC\n>A.1\nGG\n",
    "gt inside a line": b">A.1\nAC>GT\n",
    "empty file": b"",
    "no records": b"just text\n",
}


@pytest.mark.parametrize("block_size", [1, 3, 7, 1 << 24])
@pytest.mark.parametrize("name", FASTA_CASES)
def test_split_fasta_records_matches_text_mode_parser(monkeypatch, name, block_size):
    data = FASTA_CASES[name]
    monkeypatch.setattr(select_changed_records, "READ_BLOCK_SIZE", block_size)
    split = list(select_changed_records.split_fasta_records(io.BytesIO(data)))
    assert [(n, s.decode()) for n, s, _, _ in split] == text_mode_records(data)
    for record_id, _, start, end in split:
        # the byte range holds the record, so it can be read back on its own
        again = list(select_changed_records.split_fasta_records(io.BytesIO(data[start:end])))
        assert record_id in {n for n, _, _, _ in again}


@pytest.mark.parametrize("block_size", [1, 3, 1 << 24])
@pytest.mark.parametrize("name", FASTA_CASES)
def test_split_fasta_records_keeps_only_the_given_ids(monkeypatch, name, block_size):
    """what seqkit grep -f keeps, then the text-mode parser"""
    data = FASTA_CASES[name]
    monkeypatch.setattr(select_changed_records, "READ_BLOCK_SIZE", block_size)
    keep = {"B.1", ""}
    split = list(select_changed_records.split_fasta_records(io.BytesIO(data), keep))
    expected = [(n, s) for n, s in text_mode_records(data) if n in keep]
    assert [(n, s.decode()) for n, s, _, _ in split] == expected


@pytest.mark.parametrize("dropped", [b">X.1 \xff\nAC\n", b">X.1\nA\xffC\rG\n", b">X.1 \xff\rAC\n"])
def test_invalid_utf8_fails_only_in_a_kept_record(dropped):
    data = b">A.1\nAC\n" + dropped + b">B.1\nGG\n"
    split = select_changed_records.split_fasta_records(io.BytesIO(data), {"A.1", "B.1"})
    assert [n for n, _, _, _ in split] == ["A.1", "B.1"]
    with pytest.raises(UnicodeError):
        list(select_changed_records.split_fasta_records(io.BytesIO(data), {"X.1", "B.1"}))
    with pytest.raises(UnicodeError):
        list(select_changed_records.split_fasta_records(io.BytesIO(data)))


@pytest.mark.parametrize("data", [*FASTA_CASES.values(), b">", b"\n>", b">>\n>\n\n>>"])
def test_find_record_start_is_find(data):
    for start in range(len(data) + 1):
        assert select_changed_records._find_record_start(data, start) == data.find(b"\n>", start)


# --- the TSV round trip ----------------------------------------------------------------------

TSV_VALUES = [
    "plain",
    "",
    None,
    "tab\there",
    "back\\slash",
    'quote"d',
    "new\nline",
    "carriage\rreturn",
    "crlf\r\nend",
    "trailing\\",
    "é ü 中",
    True,
    False,
    7,
    "12",
    ["a", "b"],
]


def test_as_tsv_record_matches_the_tsv_round_trip():
    """format_ncbi_metadata writes a TSV that filter_out_depositions rewrites and prepare_metadata
    reads; as_tsv_record must give what prepare_metadata read"""
    headers = [f"f{i}" for i in range(len(TSV_VALUES))] + ["last"]
    row = dict(zip(headers, [*TSV_VALUES, "end"], strict=True))

    written = io.StringIO(newline="")
    writer = csv.DictWriter(
        written, fieldnames=headers, delimiter="\t", quoting=csv.QUOTE_NONE, escapechar="\\"
    )
    writer.writeheader()
    writer.writerow(row)
    # filter_out_depositions
    dialect = {"delimiter": "\t", "quoting": csv.QUOTE_NONE, "escapechar": "\\", "quotechar": None}
    rewritten = io.StringIO(newline="")
    csv_writer = csv.writer(rewritten, lineterminator="\n", **dialect)
    for tsv_row in csv.reader(io.StringIO(written.getvalue(), newline=""), **dialect):
        csv_writer.writerow(tsv_row)
    # prepare_metadata
    read = list(
        csv.DictReader(
            io.StringIO(rewritten.getvalue(), newline=""),
            delimiter="\t",
            quoting=csv.QUOTE_NONE,
            escapechar="\\",
        )
    )

    assert read == [format_ncbi_metadata.as_tsv_record(row, headers)]


# --- previous submissions --------------------------------------------------------------------


def reference_construct_submitted_dict(old_hashes, insdc_keys, config):
    """construct_submitted_dict as it was before it streamed (ingest at 8db37e034)"""
    versions_by_accession = {}
    for field in map(orjson.loads, Path(old_hashes).read_bytes().splitlines()):
        versions_by_accession.setdefault(field["accession"], []).append(field)
    latest_by_accession = {}
    for accession, versions in versions_by_accession.items():
        sorted_versions = sorted(versions, key=lambda x: int(x["version"]), reverse=True)
        if sorted_versions[0]["isRevocation"]:
            non_revoked_versions = sorted(
                [v for v in versions if not v.get("isRevocation", False)],
                key=lambda x: int(x["version"]),
                reverse=True,
            )
            latest = non_revoked_versions[0]
            latest["isRevocation"] = True
            latest["version"] = sorted_versions[0]["version"]
            latest["submitter"] = sorted_versions[0]["submitter"]
        else:
            latest = sorted_versions[0]
        latest["curated"] = {v["submitter"] for v in sorted_versions} != {"insdc_ingest_user"}
        latest_by_accession[accession] = latest

    result = {}
    for loculus_accession, entry in latest_by_accession.items():
        submitted_metadata = entry["submittedMetadata"]
        if config.segmented:
            insdc_accessions = [
                submitted_metadata[key] for key in insdc_keys if submitted_metadata[key]
            ]
            joint_accession = compare_hashes.get_joint_insdc_accession(
                submitted_metadata, insdc_keys, config
            )
        else:
            insdc_accessions = [submitted_metadata.get("insdcAccessionBase", "")]
            joint_accession = submitted_metadata.get("insdcAccessionBase", "")
        status = "REVOKED" if entry["isRevocation"] else entry["status"]
        for insdc_accession in insdc_accessions:
            latest = LatestLoculusVersion(
                loculus_accession=loculus_accession,
                latest_version=entry["version"],
                hash=submitted_metadata.get("hash"),
                status=status,
                curated=entry["curated"],
                jointAccession=joint_accession,
            )
            if insdc_accession not in result:
                result[insdc_accession] = latest
                continue
            if result[insdc_accession].loculus_accession == loculus_accession:
                continue
            if result[insdc_accession].status == "REVOKED":
                result[insdc_accession] = latest
                continue
            if latest.status == "REVOKED":
                continue
            msg = f"INSDC accession {insdc_accession} has multiple loculus accessions"
            raise ValueError(msg)
    return result


def random_history(rng: random.Random, segmented: bool) -> list[dict]:
    entries = []
    segments = ["L", "M", "S"]
    for n in range(15):
        accession = f"LOC_{n:04d}"
        # few INSDC accessions, so that several Loculus accessions share one
        bases = {s: rng.choice(["", f"A{rng.randrange(400)}"]) for s in segments}
        if not any(bases.values()):
            bases["L"] = f"A{n}"
        versions = list(range(1, rng.randrange(1, 5) + 1))
        if rng.random() < 0.2:
            versions.append(versions[-1])  # the same version number twice
        rng.shuffle(versions)
        for i, version in enumerate(versions):
            revocation = i > 0 and rng.random() < 0.3
            metadata = {"hash": rng.choice([f"h{rng.randrange(9)}", None])}
            if segmented:
                metadata |= {
                    f"insdcAccessionBase_{s}": "" if revocation else b for s, b in bases.items()
                }
            else:
                metadata["insdcAccessionBase"] = "" if revocation else bases["L"] or f"B{n}"
            entries.append(
                {
                    "accession": accession,
                    "version": version,
                    "submitter": rng.choice(["insdc_ingest_user"] * 5 + ["curator"]),
                    "isRevocation": revocation,
                    "submittedMetadata": metadata,
                    "status": rng.choice(["APPROVED_FOR_RELEASE", "HAS_ERRORS", "RECEIVED"]),
                }
            )
    rng.shuffle(entries)
    return entries


def outcome(function, path, insdc_keys, config):
    try:
        return {k: dataclasses.astuple(v) for k, v in function(path, insdc_keys, config).items()}
    except ValueError as error:
        return "multiple" if "multiple" in str(error) else "no version"
    except IndexError:
        return "no version"  # the old code found no non-revocation


@pytest.mark.parametrize("segmented", [False, True])
def test_construct_submitted_dict_matches_holding_every_version(tmp_path, segmented):
    config = compare_hashes.Config(
        **{f.name: [] for f in dataclasses.fields(compare_hashes.Config)}
    )
    config.segmented = segmented
    config.nucleotide_sequences = ["L", "M", "S"] if segmented else ["main"]
    insdc_keys = [f"insdcAccessionBase_{s}" for s in config.nucleotide_sequences]
    rng = random.Random(0)
    compared = 0
    for _ in range(300):
        path = tmp_path / "previous_submissions.ndjson"
        path.write_bytes(b"".join(orjson.dumps(e) + b"\n" for e in random_history(rng, segmented)))
        expected = outcome(reference_construct_submitted_dict, path, insdc_keys, config)
        assert (
            outcome(compare_hashes.construct_submitted_dict, path, insdc_keys, config) == expected
        )
        compared += isinstance(expected, dict)
    assert compared > 50  # enough histories without conflicts to compare maps


# --- end to end ------------------------------------------------------------------------------


def run(command, args):
    result = CliRunner().invoke(command, [str(a) for a in args], catch_exceptions=False)
    assert result.exit_code == 0, result.output


def pipeline_config(tmp_path, **overrides) -> Path:
    config = yaml.safe_load((INGEST_DIR / "config" / "defaults.yaml").read_text())
    config |= {
        "organism": "sars-cov-2",
        "nucleotide_sequences": ["main"],
        "segmented": False,
        "slack_hook": None,
        "backend_url": "http://localhost:1",
        "rename": {
            "bioprojects": "bioprojectAccession",
            "country": "geoLocCountry",
            "division": "geoLocAdmin1",
            "genbankAccession": "insdcAccessionFull",
            "ncbiCollectionDate": "sampleCollectionDate",
            "ncbiHostCommonName": "hostNameCommon",
            "ncbiHostName": "hostNameScientific",
            "ncbiHostTaxId": "hostTaxonId",
            "ncbiIsLabHost": "isLabHost",
            "ncbiIsolateName": "specimenCollectorSampleId",
            "ncbiSubmitterAffiliation": "authorAffiliations",
            "ncbiSubmitterNames": "authors",
        },
        **overrides,
    }
    path = tmp_path / "config.yaml"
    path.write_text(yaml.dump(config))
    return path


def old_chain(tmp_path, config, report, fasta, previous, exclusions, muted, subsample):
    """format -> filter depositions -> hash sequences -> prepare -> compare -> prepare_files"""
    d = tmp_path / "old"
    d.mkdir()
    run(
        format_ncbi_metadata.main,
        ["--config-file", config, "--input", report, "--output", d / "renamed.tsv"],
    )
    run(
        filter_out_depositions.filter_out_depositions,
        [
            "--config-file",
            config,
            "--input-metadata-tsv",
            d / "renamed.tsv",
            "--exclude-insdc-accessions",
            exclusions,
            "--output-metadata-tsv",
            d / "filtered.tsv",
        ],
    )
    # format_ncbi_dataset_sequences: seqkit seq -w0 -i, which does not change ids or hashes
    run(
        calculate_sequence_hashes.main,
        [
            "--input",
            fasta,
            "--output-hashes",
            d / "hashes.ndjson",
            "--output-sequences",
            d / "sequences.ndjson",
        ],
    )
    run(
        prepare_metadata.main,
        [
            "--config-file",
            config,
            "--input",
            d / "filtered.tsv",
            "--sequence-hashes-file",
            d / "hashes.ndjson",
            "--output",
            d / "metadata.ndjson",
        ],
    )
    run(
        compare_hashes.main,
        [*compare_args(config, previous, muted, subsample, d), "--metadata", d / "metadata.ndjson"],
    )
    run(
        prepare_files.main,
        prepare_files_args(config, d / "metadata.ndjson", d / "sequences.ndjson", d),
    )
    return d


def new_chain(
    tmp_path, config, report, fasta, previous, exclusions, muted, subsample, fasta_ids=None
):
    d = tmp_path / "new"
    d.mkdir()
    run(
        select_changed_records.main,
        [
            *compare_args(config, previous, muted, subsample, d),
            "--dataset-report",
            report,
            "--sequences",
            fasta,
            "--exclude-insdc-accessions",
            exclusions,
            "--output-metadata",
            d / "changed_metadata.ndjson",
            "--output-sequences",
            d / "changed_sequences.ndjson",
            *(["--fasta-ids", fasta_ids] if fasta_ids else []),
        ],
    )
    run(
        prepare_files.main,
        prepare_files_args(
            config, d / "changed_metadata.ndjson", d / "changed_sequences.ndjson", d
        ),
    )
    return d


def compare_args(config, previous, muted, subsample, d):
    args = ["--config-file", config, "--old-hashes", previous, "--subsample-fraction", subsample]
    if muted:
        args += ["--muted-hashes", muted]
    for name in ["to-submit", "to-revise", "to-revoke", "unchanged"]:
        args += [f"--{name}", d / f"{name}.json"]
    return [
        *args,
        "--output-blocked",
        d / "blocked.json",
        "--sampled-out-file",
        d / "sampled_out.json",
    ]


PREPARED = [
    "submit_metadata.tsv",
    "revise_metadata.tsv",
    "revoke_metadata.tsv",
    "submit.fasta",
    "revise.fasta",
    "revoke.fasta",
]


def prepare_files_args(config, metadata, sequences, d):
    names = [
        "--metadata-submit-path",
        "--metadata-revise-path",
        "--metadata-submit-prior-to-revoke-path",
        "--sequences-submit-path",
        "--sequences-revise-path",
        "--sequences-submit-prior-to-revoke-path",
    ]
    args = ["--config-file", config, "--metadata-path", metadata, "--sequences-path", sequences]
    for name in ["submit", "revise", "revoke"]:
        args += [f"--to-{name}-path", d / f"to-{name}.json"]
    for name, path in zip(names, PREPARED, strict=True):
        args += [name, d / path]
    return args


def write_inputs(tmp_path, report_lines):
    rng = random.Random(1)
    report = tmp_path / "data_report.jsonl"
    report.write_bytes(b"".join(report_lines))
    fasta = tmp_path / "genomic.fna"
    with open(fasta, "wb") as f:
        for line in report_lines:
            accession = orjson.loads(line)["accession"]
            sequence = "".join(rng.choice("ACGTN") for _ in range(rng.randrange(50, 300)))
            wrapped = "\n".join(sequence[i : i + 70] for i in range(0, len(sequence), 70))
            title = f"{accession} Severe acute respiratory syndrome coronavirus 2"
            f.write(f">{title}\n{wrapped}\n".encode())
    return report, fasta


def as_mirror(tmp_path, fasta):
    """The mirror's genomic.fna.zst, with records the release filter drops between the records of
    fasta, and the --fasta-ids file of the filter"""
    records = [b">" + r.lstrip(b">") for r in fasta.read_bytes().rstrip(b"\n").split(b"\n>")]
    ids = [r[1:].split(None, 1)[0] for r in records]
    unreleased = [b">OLD%d.1 not released\nACGT\nAC" % n for n in range(len(records))]
    unreleased[1] = b">OLD1.1 \xff invalid UTF-8\nAC\rGT"
    interleaved = [r for pair in zip(unreleased, records, strict=True) for r in pair]
    mirror = tmp_path / "genomic.fna.zst"
    mirror.write_bytes(zstd.compress(b"\n".join(interleaved) + b"\n"))
    fasta_ids = tmp_path / "released_accessions.txt"
    fasta_ids.write_bytes(b"".join(i + b"\n" for i in ids))
    return mirror, fasta_ids


@pytest.mark.parametrize(
    ("subsample", "from_mirror"), [("1.0", False), ("0.5", False), ("1.0", True)]
)
def test_same_outputs_as_the_chain_it_replaces(tmp_path, subsample, from_mirror):
    lines = DATA_REPORT.read_bytes().splitlines(keepends=True)
    # a repeated accession whose second record differs: prepare_files writes both
    repeated = orjson.loads(lines[4])
    repeated["isolate"]["name"] = "changed"
    lines.append(orjson.dumps(repeated) + b"\n")
    report, fasta = write_inputs(tmp_path, lines)
    config = pipeline_config(tmp_path)
    no_exclusions = tmp_path / "no_exclusions.json"
    no_exclusions.write_text(json.dumps({"insdcAccessions": [], "biosampleAccessions": []}))
    empty = tmp_path / "empty.ndjson"
    empty.write_text("")

    # a first ingest gives the hashes that a routine run finds submitted
    first = (
        old_chain(tmp_path / "first", config, report, fasta, empty, no_exclusions, None, "1.0")
        if (tmp_path / "first").mkdir() is None
        else None
    )
    hashes = {
        r["id"]: r["metadata"]
        for r in map(orjson.loads, (first / "metadata.ndjson").read_bytes().splitlines())
    }
    ids = list(hashes)
    previous, muted_rows = [], ["accession\thash_digest"]
    for n, submission_id in enumerate(ids):
        metadata = hashes[submission_id]
        entry = {
            "accession": f"LOC_{n}",
            "version": 1,
            "submitter": "insdc_ingest_user",
            "isRevocation": False,
            "submittedMetadata": {
                "hash": metadata["hash"],
                "insdcAccessionBase": metadata["insdcAccessionBase"],
            },
            "status": "APPROVED_FOR_RELEASE",
        }
        if n == 0:
            continue  # new
        if n in {1, 4}:
            entry["submittedMetadata"]["hash"] = "changed"  # revise (4 is the repeated accession)
        if n == 2:
            entry["submittedMetadata"]["hash"] = "changed"
            entry["status"] = "HAS_ERRORS"  # blocked
        if n == 3:
            entry["submittedMetadata"]["hash"] = "muted"
            muted_rows.append(f"LOC_{n}\t{metadata['hash']}")
        previous.append(entry)
    previous.append(
        {
            **previous[-1],
            "accession": "LOC_gone",
            "submittedMetadata": {"hash": "x", "insdcAccessionBase": "GONE1"},
        }
    )
    previous_path = tmp_path / "previous.ndjson"
    previous_path.write_bytes(b"".join(orjson.dumps(e) + b"\n" for e in previous))
    muted = tmp_path / "muted.tsv"
    muted.write_text("\n".join(muted_rows) + "\n")
    exclusions = tmp_path / "exclusions.json"
    biosample = orjson.loads(lines[1])["biosample"]
    exclusions.write_text(
        json.dumps({"insdcAccessions": [ids[5]], "biosampleAccessions": [biosample]})
    )

    args = (config, report, fasta, previous_path, exclusions, muted, subsample)
    old = old_chain(tmp_path, *args)
    if from_mirror:
        mirror, fasta_ids = as_mirror(tmp_path, fasta)
        new = new_chain(tmp_path, *args[:2], mirror, *args[3:], fasta_ids=fasta_ids)
    else:
        new = new_chain(tmp_path, *args)

    for name in ["to-submit", "to-revise", "to-revoke", "unchanged", "blocked", "sampled_out"]:
        assert (new / f"{name}.json").read_bytes() == (old / f"{name}.json").read_bytes(), name
    for name in PREPARED:
        assert (new / name).read_bytes() == (old / name).read_bytes(), name
    if subsample == "1.0":
        assert json.loads((new / "to-revise.json").read_text())
        assert json.loads((new / "to-submit.json").read_text())
        # both records of the repeated accession
        assert len((new / "revise_metadata.tsv").read_text().splitlines()) == 3
