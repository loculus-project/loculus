import logging
import urllib.parse
from collections import OrderedDict
from dataclasses import dataclass

import requests
from pydantic import BaseModel, Field, RootModel, ValidationError
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
    raw_internal_error,
)

logger = logging.getLogger(__name__)


def create_retrying_session(retries: int = 5) -> requests.Session:
    """Session that retries connection errors, read timeouts, 429 and selected 5xx responses
    with exponential backoff. Only idempotent methods (e.g. GET, PUT) are retried."""
    session = requests.Session()
    retry = Retry(total=retries, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


class RequestCache:
    """Class for caching requests to external services during preprocessing.

    Keys are the fully formatted URLs that have already been used to make sucessful requests.
    Values are requests.Response as they were returned by the service.
    """

    def __init__(self, max_size: int, retries=5) -> None:
        self.cache: OrderedDict[str, requests.Response] = OrderedDict()
        self.max_size = max_size
        self.session = create_retrying_session(retries)

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


TAXONOMY_BROWSER_URL = "https://www.ncbi.nlm.nih.gov/taxonomy"


class Taxon(BaseModel):
    """Subset of `Taxon` in the taxonomy service"""

    tax_id: int
    scientific_name: str | None = None
    common_name: str | None = None
    depth: int


class TaxonomyResponse(RootModel[Taxon | list[Taxon]]):
    def taxa(self) -> list[Taxon]:
        # Lookup by taxon ID always return single taxon, scientific_name can map to multiple
        return self.root if isinstance(self.root, list) else [self.root]


class TaxonomyServiceError(Exception):
    """The taxonomy service is not configured, unreachable, or returned an unexpected response."""


def lookup_failed(message: str, error_if_failed: bool) -> RawProcessingResult:
    if error_if_failed:
        return RawProcessingResult(errors=[message])
    return RawProcessingResult(warnings=[message])


def ambiguous_host_warning(host: str, selected: Taxon, taxa: list[Taxon]) -> str:
    ids = ", ".join([str(t.tax_id) for t in taxa])
    return (
        f"'{host}' matches {len(taxa)} taxa ({ids}), using the most general one: "
        f"{selected.tax_id}. To use a different taxon, enter its taxon ID in the `host` "
        f"field instead. Look up taxon IDs at {TAXONOMY_BROWSER_URL}"
    )


taxonomy_cache = RequestCache(max_size=1024)


class TaxonomyService:
    def __init__(self, taxonomy_service_url: str | None):
        self.taxonomy_service_url = taxonomy_service_url

    def _get(self, path: str) -> list[Taxon]:
        """GET `path` from the taxonomy service and return the taxa in the response.

        Returns an empty list if the service responds with 404 or 422 (invalid user input).
        Raises TaxonomyServiceError on any other non-200 status.
        """
        if not self.taxonomy_service_url:
            msg = "taxonomy_service_url was not configured."
            raise TaxonomyServiceError(msg)

        url = f"{self.taxonomy_service_url.rstrip('/')}/{path.lstrip('/')}"
        try:
            response = taxonomy_cache.get_or_fetch(url)
        except requests.exceptions.RequestException as e:
            msg = f"Network error while fetching '{url}': {e}."
            raise TaxonomyServiceError(msg) from e

        if response.status_code in (requests.codes.not_found, requests.codes.unprocessable_entity):
            logger.warning(
                f"Taxonomy service returned {response.status_code} for '{url}': {response.text}"
            )
            return []
        if response.status_code != requests.codes.ok:
            msg = (
                f"Taxonomy service returned unexpected status {response.status_code} "
                f"for '{url}': {response.text}"
            )
            raise TaxonomyServiceError(msg)

        try:
            return TaxonomyResponse.model_validate(response.json()).taxa()
        except (requests.exceptions.JSONDecodeError, ValidationError) as e:
            msg = f"Unexpected response from taxonomy service for '{url}': {e}"
            raise TaxonomyServiceError(msg) from e

    def get_tax_id(self, unvalidated_host: str, error_if_failed: bool) -> RawProcessingResult:
        if unvalidated_host.isdigit():
            path = f"/taxa/{unvalidated_host}"
        else:
            path = "/taxa?" + urllib.parse.urlencode({"scientific_name": unvalidated_host})
        try:
            taxa = self._get(path)
        except TaxonomyServiceError as e:
            return raw_internal_error(str(e))

        # multiple taxa may share a scientific name - we select the most generic one
        taxon = min(taxa, key=lambda t: t.depth, default=None)
        if taxon is None:
            message = (
                f"'{unvalidated_host}' is not a recognized host. "
                "Please provide an NCBI taxon ID or scientific name. "
                f"Find valid hosts in NCBI Taxonomy ({TAXONOMY_BROWSER_URL}). "
                "NOTE: only scientific names (not synonyms) are supported."
            )
            return lookup_failed(message, error_if_failed)

        return RawProcessingResult(
            datum=str(taxon.tax_id),
            warnings=[ambiguous_host_warning(unvalidated_host, taxon, taxa)]
            if len(taxa) > 1
            else [],
        )

    def get_scientific_name(self, tax_id: str, error_if_failed: bool) -> RawProcessingResult:
        try:
            taxa = self._get(f"/taxa/{tax_id}")
        except TaxonomyServiceError as e:
            return raw_internal_error(str(e))

        if not taxa:
            return lookup_failed(f"Could not map '{tax_id}' to scientific name.", error_if_failed)
        taxon = taxa[0]
        if taxon.scientific_name is None:
            return raw_internal_error(f"'{tax_id}' is a valid taxon ID but has no scientific name.")
        return RawProcessingResult(datum=taxon.scientific_name)

    def get_common_name(self, tax_id: str) -> RawProcessingResult:
        try:
            taxa = self._get(f"/taxa/{tax_id}?find_common_name=true")
        except TaxonomyServiceError as e:
            return raw_internal_error(str(e))

        if not taxa:
            return RawProcessingResult(warnings=[f"Could not map '{tax_id}' to common name."])
        taxon = taxa[0]
        if taxon.common_name is None:
            message = (
                "Taxonomy service indicated common name was found for "
                f"hostTaxonId '{tax_id}', but failed to return it."
            )
            return raw_internal_error(message)
        return RawProcessingResult(datum=taxon.common_name)


@dataclass(frozen=True)
class ExternalServices:
    """External services available to processing functions.

    Kept separate from `ProcessingContext` since these don't vary per accession, unlike
    `ProcessingContext`'s fields.
    """

    taxonomy_service: TaxonomyService


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
