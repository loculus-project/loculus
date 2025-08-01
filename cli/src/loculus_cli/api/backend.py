"""Backend API client for Loculus."""

from pathlib import Path

import httpx
from pydantic import ValidationError

from ..auth.client import AuthClient
from ..config import InstanceConfig
from .models import (
    AccessionVersion,
    GroupInfo,
    InstanceInfo,
    SubmissionResponse,
    UnprocessedData,
)


class BackendClient:
    """Client for Loculus backend API."""

    def __init__(self, instance_config: InstanceConfig, auth_client: AuthClient):
        self.instance_config = instance_config
        self.auth_client = auth_client
        self.client = httpx.Client(
            base_url=instance_config.backend_url,
            timeout=30.0,
            follow_redirects=True,
        )

    def _get_headers(self, username: str) -> dict[str, str]:
        """Get headers for authenticated requests."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        if username:
            auth_headers = self.auth_client.get_auth_headers(username)
            headers.update(auth_headers)

        return headers

    def get_info(self) -> InstanceInfo:
        """Get information about the Loculus instance."""
        try:
            response = self.client.get("/info")
            response.raise_for_status()
            return InstanceInfo.model_validate(response.json())
        except httpx.HTTPStatusError as e:
            raise RuntimeError(
                f"Failed to get instance info: HTTP {e.response.status_code}"
            ) from e
        except ValidationError as e:
            raise RuntimeError(f"Invalid response format: {e}") from e
        except Exception as e:
            raise RuntimeError(f"Failed to get instance info: {e}") from e

    def get_organisms(self) -> list[str]:
        """Get list of available organisms."""
        info = self.get_info()
        return [organism.name for organism in info.organisms]

    def submit_sequences(
        self,
        username: str,
        organism: str,
        metadata_file: Path,
        sequence_file: Path,
        group_id: int,
        data_use_terms: str = "OPEN",
    ) -> SubmissionResponse:
        """Submit sequences to Loculus."""
        self._get_headers(username)

        # Read files
        try:
            with open(metadata_file) as f:
                metadata_content = f.read()
            with open(sequence_file) as f:
                sequence_content = f.read()
        except Exception as e:
            raise RuntimeError(f"Failed to read input files: {e}") from e

        # Prepare multipart form data
        files = {
            "metadataFile": (
                "metadata.tsv",
                metadata_content,
                "text/tab-separated-values",
            ),
            "sequenceFile": ("sequences.fasta", sequence_content, "text/plain"),
        }

        data = {
            "groupId": str(group_id),
            "dataUseTermsType": data_use_terms,
        }

        # Remove Content-Type header to let httpx set it for multipart
        auth_headers = self.auth_client.get_auth_headers(username)

        try:
            response = self.client.post(
                f"/{organism}/submit",
                files=files,
                data=data,
                headers=auth_headers,
            )
            response.raise_for_status()

            # Parse response - API returns a list of submissions
            response_data = response.json()
            if isinstance(response_data, list):
                # Convert list to expected format
                accession_versions = []
                for item in response_data:
                    if "accession" in item and "version" in item:
                        accession_versions.append(
                            AccessionVersion(
                                accession=item["accession"], version=item["version"]
                            )
                        )
                return SubmissionResponse(accession_versions=accession_versions)
            else:
                return SubmissionResponse.model_validate(response_data)
        except httpx.HTTPStatusError as e:
            try:
                error_data = e.response.json()
                error_message = error_data.get(
                    "message", f"HTTP {e.response.status_code}"
                )
                # Include more details for debugging
                if "detail" in error_data:
                    error_message += f" - {error_data['detail']}"
                if "errors" in error_data:
                    error_message += f" - Errors: {error_data['errors']}"
            except Exception:
                error_message = f"HTTP {e.response.status_code} - {e.response.text}"
            raise RuntimeError(f"Submission failed: {error_message}") from e
        except ValidationError as e:
            raise RuntimeError(f"Invalid response format: {e}") from e
        except Exception as e:
            raise RuntimeError(f"Submission failed: {e}") from e

    def get_sequences(
        self,
        username: str,
        organism: str,
        group_id: int | None = None,
        accession_versions: list[AccessionVersion] | None = None,
    ) -> list[UnprocessedData]:
        """Get sequences from Loculus."""
        headers = self._get_headers(username)

        params: dict[str, str] = {}
        if group_id is not None:
            params["groupId"] = str(group_id)
        if accession_versions:
            params["accessionVersions"] = ",".join(
                f"{av.accession}.{av.version}" for av in accession_versions
            )

        try:
            response = self.client.get(
                f"/{organism}/get-sequences", params=params, headers=headers
            )
            response.raise_for_status()

            sequences = []
            for item in response.json():
                sequences.append(UnprocessedData.model_validate(item))

            return sequences
        except httpx.HTTPStatusError as e:
            try:
                error_data = e.response.json()
                error_message = error_data.get(
                    "message", f"HTTP {e.response.status_code}"
                )
            except Exception:
                error_message = f"HTTP {e.response.status_code}"
            raise RuntimeError(f"Failed to get sequences: {error_message}") from e
        except ValidationError as e:
            raise RuntimeError(f"Invalid response format: {e}") from e
        except Exception as e:
            raise RuntimeError(f"Failed to get sequences: {e}") from e

    def get_released_data(
        self,
        organism: str,
        compression: str = "zstd",
    ) -> bytes:
        """Get all released data for an organism."""
        params = {
            "organism": organism,
            "compression": compression,
        }

        try:
            response = self.client.get(f"/{organism}/get-released-data", params=params)
            response.raise_for_status()
            return response.content
        except httpx.HTTPStatusError as e:
            raise RuntimeError(
                f"Failed to get released data: HTTP {e.response.status_code}"
            ) from e
        except Exception as e:
            raise RuntimeError(f"Failed to get released data: {e}") from e

    def get_groups(self, username: str) -> list[GroupInfo]:
        """Get groups for the authenticated user."""
        headers = self._get_headers(username)

        try:
            response = self.client.get("/user/groups", headers=headers)
            response.raise_for_status()

            groups = []
            for item in response.json():
                groups.append(GroupInfo.model_validate(item))

            return groups
        except httpx.HTTPStatusError as e:
            try:
                error_data = e.response.json()
                error_message = error_data.get(
                    "message", f"HTTP {e.response.status_code}"
                )
            except Exception:
                error_message = f"HTTP {e.response.status_code}"
            raise RuntimeError(f"Failed to get groups: {error_message}") from e
        except ValidationError as e:
            raise RuntimeError(f"Invalid response format: {e}") from e
        except Exception as e:
            raise RuntimeError(f"Failed to get groups: {e}") from e

    def close(self) -> None:
        """Close the HTTP client."""
        self.client.close()
