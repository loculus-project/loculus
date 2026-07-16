import json
import urllib.parse
from collections import OrderedDict

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from loculus_preprocessing.datatypes import (
    AnnotationSource,
    AnnotationSourceType,
    FileCategory,
    FileIdAndNameAndReadUrl,
    ProcessingAnnotation,
    RawProcessingResult,
    _internal_error_message,
    raw_internal_error,
)


class RequestCache:
    """Class for caching requests to external services during preprocessing.

    Keys are the fully formatted URLs that have already been used to make sucessful requests.
    Values are requests.Response as they were returned by the service.
    """

    def __init__(self, max_size: int, retries=5) -> None:
        self.cache: OrderedDict[str, requests.Response] = OrderedDict()
        self.max_size = max_size
        self.session = requests.Session()
        retry = Retry(total=retries, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
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


taxonomy_cache = RequestCache(max_size=64)


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
            response.raise_for_status()
            body = response.json()
            if isinstance(body, list):
                # when querying by scientific name, multiple taxa may be returned: select the most generic one
                taxon = min(body, key=lambda x: x.get("depth", float("inf")))
            else:
                taxon = body

            tax_id = taxon.get("tax_id")
            if tax_id is None:
                message = (
                    f"Host validation for '{unvalidated_host}' failed with code "
                    f"{response.status_code}: {taxon.get('detail', '')}"
                )
                return RawProcessingResult(
                    datum=None,
                    warnings=[message] if error_if_failed else [],
                    errors=[message] if not error_if_failed else [],
                )
            return RawProcessingResult(
                datum=str(tax_id),
            )
        except requests.exceptions.RequestException as e:
            return taxonomy_network_error(
                subject=f"taxon ID {unvalidated_host}",
                action="fetching taxon info",
                e=e,
            )

    def get_scientific_name(self, tax_id: str) -> RawProcessingResult:
        if not self.taxonomy_service_url:
            return missing_taxonomy_service_error()

        url = f"{self.taxonomy_service_url}/taxa/{tax_id}"
        try:
            response = taxonomy_cache.get_or_fetch(url)
            response.raise_for_status()
            body = response.json()
            scientific_name = body.get("scientific_name")
            if scientific_name is None:
                return raw_internal_error(
                    f"'{tax_id}' is a valid taxon ID but response json had no 'scientific_name'."
                )
            return RawProcessingResult(
                datum=scientific_name,
            )
        except requests.exceptions.RequestException as e:
            return taxonomy_network_error(
                subject=f"taxon ID {tax_id}",
                action="fetching taxon scientific name",
                e=e,
            )

    def get_common_name(self, tax_id: str) -> RawProcessingResult:
        if not self.taxonomy_service_url:
            return missing_taxonomy_service_error()

        url = f"{self.taxonomy_service_url}/taxa/{tax_id}?find_common_name=true"
        try:
            response = taxonomy_cache.get_or_fetch(url)
            response.raise_for_status()
            body = response.json()
            common_name = body.get("common_name")
            if common_name is None:
                return raw_internal_error(
                    f"'{tax_id}' is a valid taxon ID but response json had no 'common_name'."
                )
            return RawProcessingResult(
                datum=common_name,
            )
        except requests.exceptions.RequestException as e:
            return taxonomy_network_error(
                subject=f"taxon ID {tax_id}",
                action="fetching taxon common name",
                e=e,
            )


def file_processing_service_error(file_names: str, message: str) -> ProcessingAnnotation:
    return ProcessingAnnotation(
        [AnnotationSource(file_names, AnnotationSourceType.FILE)],
        [AnnotationSource(file_names, AnnotationSourceType.FILE)],
        message,
    )


class FileProcessingService:
    def __init__(self, file_processing_service_url: str | None):
        self.file_processing_service_url = file_processing_service_url

    def process_files(
        self, files: dict[FileCategory, list[FileIdAndNameAndReadUrl]]
    ) -> tuple[list[ProcessingAnnotation], list[ProcessingAnnotation]]:
        file_names = ", ".join(file.name for file_list in files.values() for file in file_list)
        if not self.file_processing_service_url:
            return [
                file_processing_service_error(
                    file_names,
                    _internal_error_message("File processing service URL is not configured."),
                )
            ], []

        url = f"{self.file_processing_service_url}/process-files"
        try:
            response = requests.post(url, data=json.dumps(files), timeout=10)
            response.raise_for_status()
            body = response.json()

            errors = [
                file_processing_service_error(file_name, message)
                for file_name, file_category, message in body.get("errors")
            ]
            warnings = [
                file_processing_service_error(file_name, message)
                for file_name, file_category, message in body.get("warnings")
            ]
            return errors, warnings
        except requests.exceptions.RequestException as e:
            return [
                file_processing_service_error(
                    file_names,
                    _internal_error_message(f"An error: {e} occurred while processing files."),
                )
            ], []
