import io
import logging
import re
import urllib.parse
import xml.etree.ElementTree as ET
from collections import OrderedDict
from dataclasses import dataclass
from enum import StrEnum
from http import HTTPStatus

import requests
from pydantic import BaseModel, Field, ValidationError
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from loculus_preprocessing.datatypes import (
    AccessionVersion,
    AnnotationSource,
    AnnotationSourceType,
    FileCategory,
    FileIdAndNameAndReadUrl,
    ProcessingAnnotation,
    RawProcessingResult,
    _internal_error_message,
    processing_error,
    raw_internal_error,
)

logger = logging.getLogger(__name__)


class RequestCache:
    """Class for caching requests to external services during preprocessing.

    Keys are the fully formatted URLs that have already been used to make sucessful requests.
    Values are requests.Response as they were returned by the service.
    """

    def __init__(self, max_size: int, retries=5) -> None:
        self.cache: OrderedDict[str, requests.Response] = OrderedDict()
        self.max_size = max_size
        self.session = requests.Session()
        retry = Retry(total=retries, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    def get(self, url: str) -> requests.Response | None:
        if url in self.cache:
            self.cache.move_to_end(url)
            return self.cache[url]
        return None

    def set(self, url: str, response: requests.Response) -> None:
        self.cache[url] = response
        self.cache.move_to_end(url)

        if len(self.cache) > self.max_size:
            self.cache.popitem(last=False)

    def get_or_fetch(self, url: str, timeout: int = 15) -> requests.Response:
        """
        Check if `url` already exists in the cache and return the cached Response if it does.

        If `url` is not in the cache, make the actual request (with timeout and retries).
        Add the Response to the cache (if status code in the 200s), and return the Response.

        The caller should wrap this in a try/except block and handle errors.
        """
        response = self.get(url)
        if response is None:
            response = self.session.get(url, timeout=timeout)
            if 200 <= response.status_code < 300:  # noqa: PLR2004
                self.set(url, response)
        return response

    def clear(self) -> None:
        self.cache.clear()


def missing_taxonomy_service_error() -> RawProcessingResult:
    return raw_internal_error("taxonomy_service_url was not configured.")


def taxonomy_network_error(
    subject: str,
    action: str,
    e: Exception,
) -> RawProcessingResult:
    return raw_internal_error(f"Network error while {action} '{subject}': {e}.")


taxonomy_cache = RequestCache(max_size=1024)


class TaxonomyService:
    def __init__(self, taxonomy_service_url: str | None):
        self.taxonomy_service_url = taxonomy_service_url

    def get_tax_id(self, unvalidated_host: str, error_if_failed: bool) -> RawProcessingResult:
        if not self.taxonomy_service_url:
            return missing_taxonomy_service_error()

        if unvalidated_host.isdigit():
            url = f"{self.taxonomy_service_url}/taxa/{unvalidated_host}"
        else:
            query = urllib.parse.urlencode({"scientific_name": unvalidated_host})
            url = f"{self.taxonomy_service_url}/taxa?{query}"
        try:
            response = taxonomy_cache.get_or_fetch(url)
            body = response.json()
        except requests.exceptions.RequestException as e:
            return taxonomy_network_error(
                subject=f"taxon ID {unvalidated_host}",
                action="fetching taxon info",
                e=e,
            )
        if response.status_code != requests.codes.ok:
            message = f"Host validation for '{unvalidated_host}' failed."
            details = f"with code {response.status_code}: {body.get('detail', '')}"
            logger.error(message + details)
            return RawProcessingResult(
                datum=None,
                warnings=[message] if not error_if_failed else [],
                errors=[message] if error_if_failed else [],
            )
        if isinstance(body, list):
            # when querying by scientific name, multiple taxa may be returned
            # - we select the most generic one
            if not body:
                message = (
                    f"Host validation for '{unvalidated_host}' was successful "
                    "but no taxa were returned."
                )
                return raw_internal_error(message)
            taxon = min(body, key=lambda x: x.get("depth", float("inf")))
        else:
            taxon = body

        tax_id = taxon.get("tax_id")
        if tax_id is None:
            message = (
                f"Host validation for '{unvalidated_host}' was successful "
                "but response json 'tax_id' was missing."
            )
            return raw_internal_error(message)
        return RawProcessingResult(
            datum=str(tax_id),
        )

    def get_scientific_name(self, tax_id: str, error_if_failed: bool) -> RawProcessingResult:
        if not self.taxonomy_service_url:
            return missing_taxonomy_service_error()

        url = f"{self.taxonomy_service_url}/taxa/{tax_id}"
        try:
            response = taxonomy_cache.get_or_fetch(url)
            body = response.json()
        except requests.exceptions.RequestException as e:
            return taxonomy_network_error(
                subject=f"taxon ID {tax_id}",
                action="fetching taxon scientific name",
                e=e,
            )
        if response.status_code != requests.codes.ok:
            message = f"Could not map '{tax_id}' to scientific name."
            details = f"Code {response.status_code}: {body.get('detail', '')}"
            logger.error(message + details)
            return RawProcessingResult(
                datum=None,
                warnings=[message] if not error_if_failed else [],
                errors=[message] if error_if_failed else [],
            )

        scientific_name = body.get("scientific_name")
        if scientific_name is None:
            message = f"'{tax_id}' is a valid taxon ID but response json had no 'scientific_name'."
            return raw_internal_error(message)

        return RawProcessingResult(datum=scientific_name)

    def get_common_name(self, tax_id: str) -> RawProcessingResult:
        if not self.taxonomy_service_url:
            return missing_taxonomy_service_error()

        url = f"{self.taxonomy_service_url}/taxa/{tax_id}?find_common_name=true"
        try:
            response = taxonomy_cache.get_or_fetch(url)
            body = response.json()
        except requests.exceptions.RequestException as e:
            return taxonomy_network_error(
                subject=f"taxon ID {tax_id}",
                action="fetching taxon common name",
                e=e,
            )
        if response.status_code != requests.codes.ok:
            message = f"Could not map '{tax_id}' to common name."
            details = f"Code {response.status_code}: {body.get('detail', '')}"
            logger.error(message + details)
            return RawProcessingResult(
                warnings=[message],
            )

        common_name = body.get("common_name")
        if common_name is None:
            message = f"Taxonomy service indicated common name was found for hostTaxonId '{tax_id}', but failed to return it."
            return raw_internal_error(message)

        return RawProcessingResult(datum=common_name)


FileName = str


class FileProcessingRequest(BaseModel):
    files: list[FileIdAndNameAndReadUrl]
    accessionVersion: str  # noqa: N815


class Annotation(BaseModel):
    fileNames: list[FileName]  # noqa: N815
    message: str


class FileProcessingResponse(BaseModel):
    errors: list[Annotation] = Field(default_factory=list)


class FileProcessingService:
    def __init__(
        self,
        raw_reads_processing_service_url: str | None,
        timeout_seconds: int = 300,
    ):
        self.raw_reads_processing_service_url = raw_reads_processing_service_url
        self.timeout_seconds = timeout_seconds

    def process_files(  # noqa: PLR0911
        self,
        files: dict[FileCategory, list[FileIdAndNameAndReadUrl]],
        accession_version: AccessionVersion,
    ) -> list[ProcessingAnnotation]:
        for category, file_list in files.items():
            if not file_list:
                continue
            if category != FileCategory.RAW_READS:
                message = (
                    f"File category '{category}' is enabled but not supported by preprocessing."
                )
                logger.warning(message)
                return [self._annotation([file.name for file in file_list], message)]

        file_names = [file.name for file_list in files.values() for file in file_list]

        if not self.raw_reads_processing_service_url:
            return [
                self._annotation(file_names, "Raw reads processing service URL is not configured.")
            ]

        payload = FileProcessingRequest(
            files=files[FileCategory.RAW_READS], accessionVersion=str(accession_version)
        )
        try:
            response = requests.post(
                f"{self.raw_reads_processing_service_url}/process-files",
                json=payload.model_dump(mode="json"),
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
        except requests.exceptions.HTTPError as error:
            response = error.response
            if response is not None and response.status_code >= 500:  # noqa: PLR2004
                try:
                    detail = response.json().get("detail", response.text)
                except ValueError:
                    detail = response.text
                return [
                    self._annotation(file_names, f"Raw reads processing service failed: {detail}")
                ]
            return [self._annotation(file_names, f"Raw reads processing service failed: {error}")]
        except requests.exceptions.RequestException as error:
            return [self._annotation(file_names, f"Raw reads processing request failed: {error}")]

        try:
            result = FileProcessingResponse.model_validate(response.json())
        except ValidationError as error:
            return [
                self._annotation(
                    file_names,
                    f"Raw reads processing service returned an invalid response: {error}",
                )
            ]

        return [
            self._annotation(error.fileNames, error.message, internal_error=False)
            for error in result.errors
        ]

    @staticmethod
    def _annotation(
        file_names: list[str], message: str, internal_error: bool = True
    ) -> ProcessingAnnotation:
        source = AnnotationSource(", ".join(file_names), AnnotationSourceType.FILE)
        if not internal_error:
            return ProcessingAnnotation([source], [source], message)
        return ProcessingAnnotation([source], [source], _internal_error_message(message))


# Successful ENA responses are small XML documents (a few KB). Cache hits refresh an entry's
# position; a bioproject shared across a batch stays cached while unique biosamples and runs
# cycle through.
ena_cache = RequestCache(max_size=16)


class EnaAccessionType(StrEnum):
    BIOPROJECT = "bioproject"
    BIOSAMPLE = "biosample"
    RAW_READS = "raw_reads"


# Rules out surrounding whitespace and comma-separated lists, which the ENA browser API
# would otherwise resolve to multiple records.
ACCESSION_PATTERNS: dict[EnaAccessionType, re.Pattern[str]] = {
    EnaAccessionType.BIOPROJECT: re.compile(r"PRJ[EDN][A-Z][0-9]+"),
    EnaAccessionType.BIOSAMPLE: re.compile(r"SAM[EDN][A-Z]?[0-9]+"),
    EnaAccessionType.RAW_READS: re.compile(r"[EDS]RR[0-9]+"),
}


class ENAVisibilityChecker:
    """Used to check ENA visibility

    Adapted from the ENAVisibilityChecker in
    ena-submission/src/ena_deposition/check_external_visibility.py.
    If anything changes in that class, check whether the update needs to
    be applied here as well.
    """

    def __init__(
        self,
        timeout_seconds: int = 30,
    ):
        self.timeout_seconds = timeout_seconds

    def check_visibility(self, accession: str, accession_type_arg: str) -> RawProcessingResult:
        try:
            accession_type = EnaAccessionType(accession_type_arg)
        except ValueError:
            return raw_internal_error(
                f"invalid accession_type '{accession_type_arg}', expected one of "
                f"{[t.value for t in EnaAccessionType]}."
            )
        accession = accession.upper()
        pattern = ACCESSION_PATTERNS[accession_type]
        if not pattern.fullmatch(accession):
            return processing_error(
                f"'{accession}' is not a valid {accession_type.replace('_', ' ')} accession, "
                f"expected a value matching '{pattern.pattern}'."
            )
        try:
            response = ena_cache.get_or_fetch(
                f"https://www.ebi.ac.uk/ena/browser/api/xml/{accession}",
                timeout=self.timeout_seconds,
            )
        except requests.RequestException:
            response = None
        if response is None or response.status_code >= HTTPStatus.INTERNAL_SERVER_ERROR:
            return RawProcessingResult(
                datum=accession,
                warnings=[
                    f"unable to check visibility of '{accession}': could not reach ENA. Please "
                    f"verify yourself that '{accession}' is public before proceeding or we will "
                    "not be able to propagate your submission to the INSDC."
                ],
            )
        if response.status_code != HTTPStatus.OK:
            return RawProcessingResult(
                datum=accession,
                warnings=[
                    f"accession '{accession}' is not visible on ENA. Please make '{accession}' "
                    "public before proceeding or we will not be able to propagate your "
                    "submission to the INSDC."
                ],
            )
        if accession_type == EnaAccessionType.BIOPROJECT and self._is_umbrella_project(
            response.content
        ):
            return processing_error(
                f"bioproject '{accession}' is an umbrella project. "
                "Please provide the accession of a submission project instead."
            )
        return RawProcessingResult(datum=accession)

    def _is_umbrella_project(self, xml_bytes) -> bool:
        for _, elem in ET.iterparse(io.BytesIO(xml_bytes), events=("start",)):  # noqa: S314
            if elem.tag == "UMBRELLA_PROJECT":
                return True
            if elem.tag == "SUBMISSION_PROJECT":
                return False
        return False


@dataclass(frozen=True)
class ExternalServices:
    """External services available to processing functions.

    Kept separate from `ProcessingContext` since these don't vary per accession, unlike
    `ProcessingContext`'s fields.
    """

    taxonomy_service: TaxonomyService
    ena_visibility_checker: ENAVisibilityChecker
