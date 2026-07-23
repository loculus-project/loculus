#!/usr/bin/env python3
"""Enrich NCBI Datasets mirror accessions from NCBI Entrez/GenBank.

The Datasets download remains the source of sequence data. This program is a
downstream metadata sidecar: it obtains the corresponding INSDC record from
nuccore and writes fields that Datasets/NCBI Virus may omit.
"""

from __future__ import print_function

import argparse
import email.utils
import io
import json
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile


EUTILS_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
ACCESSION_RE = re.compile(r"\b([A-Za-z]{1,6}_?\d+(?:\.\d+)?)\b")
MAX_429_RETRIES = 5
MAX_RETRY_DELAY_SECONDS = 60


def accessions_from_fasta(lines):
    """Yield the first accession-looking identifier from each FASTA header."""
    for line in lines:
        if line.startswith(">"):
            match = ACCESSION_RE.search(line)
            if match:
                yield match.group(1)


def accessions_from_input(path):
    if path.endswith(".zip"):
        with zipfile.ZipFile(path) as archive:
            names = [name for name in archive.namelist()
                     if name.endswith("ncbi_dataset/data/genomic.fna")]
            if not names:
                raise ValueError("zip does not contain ncbi_dataset/data/genomic.fna")
            with archive.open(names[0]) as fasta:
                return set(accessions_from_fasta(io.TextIOWrapper(fasta, encoding="utf-8")))

    with open(path, "r", encoding="utf-8") as handle:
        first = handle.read(1)
        handle.seek(0)
        if first == ">":
            return set(accessions_from_fasta(handle))
        return set(line.strip() for line in handle if line.strip() and not line.startswith("#"))


def load_previous_enrichment(path):
    """Read a previous JSONL output into an accession-version keyed mapping."""
    if not path:
        return {}

    records = {}
    with open(path, "r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            record = json.loads(line)
            accession = record.get("requested_accession")
            if not accession:
                raise ValueError(
                    "{}:{} does not contain requested_accession".format(path, line_number)
                )
            records[accession] = record
    return records


def children_text(node, path):
    return [child.text for child in node.findall(path) if child.text]


def parse_gbseq(node):
    """Parse the GBSeq XML schema returned by nuccore EFetch."""
    qualifiers = {}
    for feature in node.findall("./GBSeq_feature-table/GBFeature"):
        if feature.findtext("GBFeature_key") != "source":
            continue
        for item in feature.findall("./GBFeature_quals/GBQualifier"):
            key = item.findtext("GBQualifier_name")
            value = item.findtext("GBQualifier_value")
            if key and value:
                qualifiers.setdefault(key, []).append(value)

    direct_submission_authors = []
    authors = []
    for reference in node.findall("./GBSeq_references/GBReference"):
        reference_authors = children_text(reference, "./GBReference_authors/GBAuthor")
        authors.extend(reference_authors)
        if reference.findtext("GBReference_title") == "Direct Submission":
            direct_submission_authors.extend(reference_authors)

    return {
        "accession_version": node.findtext("GBSeq_accession-version"),
        "accession_base": node.findtext("GBSeq_primary-accession"),
        "definition": node.findtext("GBSeq_definition"),
        "organism": node.findtext("GBSeq_organism"),
        "taxonomy": node.findtext("GBSeq_taxonomy"),
        "division": node.findtext("GBSeq_division"),
        "length": node.findtext("GBSeq_length"),
        "update_date": node.findtext("GBSeq_update-date"),
        "create_date": node.findtext("GBSeq_create-date"),
        "strain": qualifiers.get("strain", []),
        "isolate": qualifiers.get("isolate", []),
        "host": qualifiers.get("host", []),
        "host_age": qualifiers.get("host_age", []),
        "authors": direct_submission_authors or authors,
        "source_qualifiers": qualifiers,
    }


def parse_record(node):
    if node.tag == "GBSeq":
        return parse_gbseq(node)

    qualifiers = {}
    for feature in node.findall("./INSDSeq_feature-table/INSDFeature"):
        if feature.findtext("INSDFeature_key") != "source":
            continue
        for item in feature.findall("./INSDFeature_quals/INSDQualifier"):
            key = item.findtext("INSDQualifier_name")
            value = item.findtext("INSDQualifier_value")
            if key and value:
                qualifiers.setdefault(key, []).append(value)

    authors = []
    for reference in node.findall("./INSDSeq_references/INSDReference"):
        authors.extend(children_text(reference, "./INSDReference_authors/INSDReference_author"))

    return {
        "accession_version": node.findtext("INSDSeq_accession-version"),
        "accession_base": node.findtext("INSDSeq_primary-accession"),
        "definition": node.findtext("INSDSeq_definition"),
        "organism": node.findtext("INSDSeq_organism"),
        "taxonomy": node.findtext("INSDSeq_taxonomy"),
        "division": node.findtext("INSDSeq_division"),
        "length": node.findtext("INSDSeq_length"),
        "update_date": node.findtext("INSDSeq_update-date"),
        "create_date": node.findtext("INSDSeq_create-date"),
        "strain": qualifiers.get("strain", []),
        "isolate": qualifiers.get("isolate", []),
        "host": qualifiers.get("host", []),
        "host_age": qualifiers.get("host_age", []),
        "authors": authors,
        "source_qualifiers": qualifiers,
    }


def retry_after_seconds(error):
    """Return the delay requested by an HTTP Retry-After header, if present."""
    value = error.headers.get("Retry-After")
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        retry_at = email.utils.parsedate_to_datetime(value)
        if retry_at is None:
            return None
        return max(0.0, retry_at.timestamp() - time.time())


def fetch_batch(accessions, email, api_key):
    query = {
        "db": "nuccore",
        "id": ",".join(accessions),
        "rettype": "gbwithparts",
        "retmode": "xml",
        "tool": "loc-mirror-insdc",
        "email": email,
    }
    if api_key:
        query["api_key"] = api_key
    url = EUTILS_URL + "?" + urllib.parse.urlencode(query)
    for retry in range(MAX_429_RETRIES + 1):
        try:
            with urllib.request.urlopen(url, timeout=90) as response:
                root = ET.parse(response).getroot()
            break
        except urllib.error.HTTPError as error:
            if error.code != 429 or retry == MAX_429_RETRIES:
                raise
            requested_delay = retry_after_seconds(error)
            exponential_delay = min(2 ** retry, MAX_RETRY_DELAY_SECONDS)
            delay = max(requested_delay or 0, exponential_delay)
            # Jitter reduces the chance that parallel mirror jobs retry together.
            delay = min(delay + random.uniform(0, 1), MAX_RETRY_DELAY_SECONDS)
            print(
                "Entrez returned HTTP 429; retrying in {:.1f}s ({}/{})".format(
                    delay, retry + 1, MAX_429_RETRIES
                ),
                file=sys.stderr,
            )
            time.sleep(delay)
    records = {}
    for sequence in root.findall("INSDSeq") + root.findall("GBSeq"):
        record = parse_record(sequence)
        for key in (record["accession_version"], record["accession_base"]):
            if key:
                records[key] = record
    return records


def chunks(items, size):
    for start in range(0, len(items), size):
        yield items[start:start + size]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="Datasets .zip, FASTA, or one-accession-per-line file")
    parser.add_argument("--email", required=True, help="Contact email required by NCBI E-utilities")
    parser.add_argument("--api-key", help="Optional NCBI API key (also raises request allowance)")
    parser.add_argument(
        "--previous-enrichment",
        help="Previous enrichment JSONL; records in it are reused by requested accession version",
    )
    parser.add_argument("--output", default="-", help="JSON Lines output path (default: stdout)")
    parser.add_argument("--refresh", action="store_true", help="Ignore records in --previous-enrichment")
    parser.add_argument("--batch-size", type=int, default=100, help="Accessions per EFetch request")
    args = parser.parse_args()

    if not 1 <= args.batch_size <= 200:
        parser.error("--batch-size must be between 1 and 200")
    accessions = sorted(accessions_from_input(args.input))
    if not accessions:
        parser.error("no accessions found")

    previous = {} if args.refresh else load_previous_enrichment(args.previous_enrichment)
    records = []
    missing = []
    for accession in accessions:
        record = previous.get(accession)
        # Retry an earlier miss: it may have been caused by a transient Entrez
        # response or, as in a schema migration, an older parser.
        if record and not record.get("not_found"):
            records.append(record)
        else:
            missing.append(accession)

    # NCBI allows three requests/second without a key, ten with one. Leave a
    # margin; reuse of the previous enrichment makes repeat runs cheap.
    pause = 0.12 if args.api_key else 0.35
    for batch in chunks(missing, args.batch_size):
        try:
            fetched = fetch_batch(batch, args.email, args.api_key)
        except (urllib.error.URLError, ET.ParseError) as error:
            raise RuntimeError("Entrez request failed for {}: {}".format(
                ",".join(batch), error))
        for requested in batch:
            record = fetched.get(requested)
            if record is None:
                record = fetched.get(requested.split(".", 1)[0])
            if record is None:
                record = {"requested_accession": requested, "not_found": True}
            else:
                record = dict(record, requested_accession=requested)
            records.append(record)
        time.sleep(pause)

    output = sys.stdout if args.output == "-" else open(args.output, "w", encoding="utf-8")
    try:
        for record in sorted(records, key=lambda item: item["requested_accession"]):
            output.write(json.dumps(record, sort_keys=True) + "\n")
    finally:
        if output is not sys.stdout:
            output.close()


if __name__ == "__main__":
    main()
