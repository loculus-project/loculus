"""Client for the Loculus query-service v1 API.

Kept named ``LapisClient`` for now to avoid churning callers; the
``lapis_url`` argument is the query-service base URL, and ``organism``
is passed as a query parameter on every request.
"""

from typing import Any

import httpx
from pydantic import ValidationError

from ..utils.console import get_stderr_console
from .models import LapisAggregatedResponse, LapisResponse, LapisSequenceResponse


class LapisClient:
    """Client for LAPIS API."""

    def __init__(self, lapis_url: str):
        self.lapis_url = lapis_url
        self.client = httpx.Client(
            base_url=lapis_url,
            timeout=60.0,  # LAPIS queries can take longer
            follow_redirects=True,
        )
        self.stderr_console = get_stderr_console()

    def _log_request(self, response: httpx.Response) -> None:
        """Log the API request to stderr."""
        self.stderr_console.print(
            f"[dim]→ {response.request.method} {response.url}[/dim]"
        )

    def _params_with_organism(
        self, organism: str, params: dict[str, Any]
    ) -> dict[str, Any]:
        return {"organism": organism, **params}

    def get_sample_details(
        self,
        organism: str,
        filters: dict[str, Any] | None = None,
        limit: int | None = None,
        offset: int | None = None,
        order_by: str | None = None,
        fields: list[str] | None = None,
    ) -> LapisResponse:
        """Get sample details from the query-service."""
        params: dict[str, Any] = {}
        if filters:
            params.update(filters)
        if limit is not None:
            params["limit"] = str(limit)
        if offset is not None:
            params["offset"] = str(offset)
        if order_by:
            params["orderBy"] = order_by
        if fields:
            params["fields"] = ",".join(fields)

        try:
            response = self.client.get(
                "/v1/details", params=self._params_with_organism(organism, params)
            )
            self._log_request(response)
            response.raise_for_status()
            return LapisResponse.model_validate(response.json())
        except httpx.HTTPStatusError as e:
            raise RuntimeError(
                f"LAPIS query failed: HTTP {e.response.status_code}"
            ) from e
        except ValidationError as e:
            raise RuntimeError(f"Invalid LAPIS response format: {e}") from e
        except Exception as e:
            raise RuntimeError(f"LAPIS query failed: {e}") from e

    def get_aggregated_data(
        self,
        organism: str,
        filters: dict[str, Any] | None = None,
        group_by: list[str] | None = None,
        order_by: str | None = None,
    ) -> LapisAggregatedResponse:
        """Get aggregated data from the query-service."""
        params: dict[str, Any] = {}
        if filters:
            params.update(filters)
        if group_by:
            params["groupBy"] = ",".join(group_by)
        if order_by:
            params["orderBy"] = order_by

        try:
            response = self.client.get(
                "/v1/aggregated", params=self._params_with_organism(organism, params)
            )
            self._log_request(response)
            response.raise_for_status()
            return LapisAggregatedResponse.model_validate(response.json())
        except httpx.HTTPStatusError as e:
            raise RuntimeError(
                f"LAPIS aggregated query failed: HTTP {e.response.status_code}"
            ) from e
        except ValidationError as e:
            raise RuntimeError(f"Invalid LAPIS response format: {e}") from e
        except Exception as e:
            raise RuntimeError(f"LAPIS aggregated query failed: {e}") from e

    def get_aligned_sequences(
        self,
        organism: str,
        segment: str | None = None,
        filters: dict[str, Any] | None = None,
        limit: int | None = None,
        offset: int | None = None,
        order_by: str | None = None,
    ) -> LapisSequenceResponse:
        """Get aligned sequences from the query-service."""
        path = "/v1/alignedSequences"
        if segment:
            path = f"{path}/{segment}"
        params: dict[str, Any] = {}
        if filters:
            params.update(filters)
        if limit is not None:
            params["limit"] = str(limit)
        if offset is not None:
            params["offset"] = str(offset)
        if order_by:
            params["orderBy"] = order_by

        try:
            headers = {"Accept": "text/x-fasta"}
            response = self.client.get(
                path,
                params=self._params_with_organism(organism, params),
                headers=headers,
            )
            self._log_request(response)
            response.raise_for_status()

            fasta_data = _parse_fasta(response.text, "alignedNucleotideSequence")
            return LapisSequenceResponse(data=fasta_data, info={})
        except httpx.HTTPStatusError as e:
            full_url = str(e.response.url)
            raise RuntimeError(
                f"LAPIS sequence query failed: HTTP {e.response.status_code}"
                f" - URL: {full_url}"
            ) from e
        except Exception as e:
            raise RuntimeError(f"LAPIS sequence query failed: {e}") from e

    def get_unaligned_sequences(
        self,
        organism: str,
        segment: str | None = None,
        filters: dict[str, Any] | None = None,
        limit: int | None = None,
        offset: int | None = None,
        order_by: str | None = None,
    ) -> LapisSequenceResponse:
        """Get unaligned sequences from the query-service."""
        path = "/v1/unalignedSequences"
        if segment:
            path = f"{path}/{segment}"
        params: dict[str, Any] = {}
        if filters:
            params.update(filters)
        if limit is not None:
            params["limit"] = str(limit)
        if offset is not None:
            params["offset"] = str(offset)
        if order_by:
            params["orderBy"] = order_by

        try:
            headers = {"Accept": "text/x-fasta"}
            response = self.client.get(
                path,
                params=self._params_with_organism(organism, params),
                headers=headers,
            )
            self._log_request(response)
            response.raise_for_status()

            fasta_data = _parse_fasta(response.text, "unalignedNucleotideSequence")
            return LapisSequenceResponse(data=fasta_data, info={})
        except httpx.HTTPStatusError as e:
            full_url = str(e.response.url)
            raise RuntimeError(
                f"LAPIS sequence query failed: HTTP {e.response.status_code}"
                f" - URL: {full_url}"
            ) from e
        except Exception as e:
            raise RuntimeError(f"LAPIS sequence query failed: {e}") from e

    def close(self) -> None:
        """Close the HTTP client."""
        self.client.close()


def _parse_fasta(text: str, sequence_field: str) -> list[dict[str, str]]:
    """Parse a FASTA blob into [{accessionVersion, <sequence_field>}, ...]."""
    fasta_data: list[dict[str, str]] = []
    if not text.strip():
        return fasta_data
    current_header: str | None = None
    current_sequence: list[str] = []
    for line in text.strip().split("\n"):
        if line.startswith(">"):
            if current_header is not None:
                fasta_data.append(
                    {
                        "accessionVersion": current_header,
                        sequence_field: "".join(current_sequence),
                    }
                )
            current_header = line[1:]
            current_sequence = []
        else:
            current_sequence.append(line)
    if current_header is not None:
        fasta_data.append(
            {
                "accessionVersion": current_header,
                sequence_field: "".join(current_sequence),
            }
        )
    return fasta_data
