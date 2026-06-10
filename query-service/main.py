"""
Loculus query-service v1 API.

The website and CLI talk to this service instead of LAPIS directly. We own
the API surface so we can:

  * apply implicit defaults once (latest version, no revocations) instead
    of every caller bolting them on,
  * keep room for response transformations later (filtering records,
    redacting fields, etc.) without breaking callers.

Routes (under /v1/):

    GET|POST  /v1/aggregated                    ?organism=
    GET|POST  /v1/metadata                       ?organism=
    GET|POST  /v1/mutations                     ?organism=
    GET|POST  /v1/aaMutations                   ?organism=
    GET|POST  /v1/insertions                    ?organism=
    GET|POST  /v1/aaInsertions                  ?organism=
    GET|POST  /v1/alignedSequences              ?organism=
    GET|POST  /v1/alignedSequences/{segment}    ?organism=
    GET|POST  /v1/unalignedSequences            ?organism=
    GET|POST  /v1/unalignedSequences/{segment}  ?organism=
    GET|POST  /v1/aaSequences/{proteinName}     ?organism=
    GET       /v1/info                          ?organism=
    GET       /v1/lineageDefinition             ?organism=&column=

Reserved control params:
    organism, format, download, fields, limit, offset, include,
    reference

Anything else is a metadata-column filter and is forwarded to LAPIS
verbatim.

Implicit defaults:
    versionStatus = LATEST_VERSION
    isRevocation  = false
Override with `include=revoked|older-versions|all` (repeatable). If the
caller's params already mention any version-related field
(accessionVersion, version, versionStatus), the defaults are dropped —
the explicit filter wins.

POST body shape: flat. Reserved control keys live at the top level
(`organism`, `fields`, `limit`, `format`, …) and everything else is
treated as a metadata-column filter and forwarded as-is. This matches
LAPIS's own POST body so existing flat bodies migrate without rewriting.
"""

from __future__ import annotations

import json
import logging
import os
import re
from collections.abc import AsyncIterator
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("query-service")

LAPIS_SERVICE_TEMPLATE = os.environ.get(
    "LAPIS_SERVICE_TEMPLATE", "http://loculus-lapis-service-{organism}:8080"
)
UPSTREAM_TIMEOUT_SECONDS = float(os.environ.get("UPSTREAM_TIMEOUT_SECONDS", "60"))
# Comma-separated list of valid organism keys (e.g. "cchf,mpox").
# When set, the Swagger UI renders a dropdown instead of a free-text field.
ORGANISMS: list[str] = [
    o.strip()
    for o in os.environ.get("ORGANISMS", "").split(",")
    if o.strip()
]

ORGANISM_RE = re.compile(r"^[a-z][a-z0-9-]*$")

HOP_BY_HOP = frozenset(
    h.lower()
    for h in (
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "host",
        "content-length",
    )
)

# Params we own. Anything not in here is forwarded to LAPIS as-is.
CONTROL_PARAMS = frozenset(
    {
        "organism",
        "format",
        "download",
        "fields",
        "limit",
        "offset",
        "include",
        "reference",
    }
)
# Of the control params, these are the ones LAPIS itself understands and
# should be forwarded (with translation in the case of format/download).
PASS_THROUGH = frozenset({"fields", "limit", "offset"})

# If any of these appear in the caller's params, drop the implicit version
# defaults — the caller is explicitly asking about specific versions.
VERSION_OVERRIDE_KEYS = frozenset({"accessionVersion", "version", "versionStatus"})

VALID_INCLUDES = frozenset({"revoked", "older-versions", "all"})

_organism_schema: dict = (
    {"type": "string", "enum": ORGANISMS}
    if ORGANISMS
    else {"type": "string", "example": "cchf"}
)

_COMMON_CONTROL_PARAMS: list[dict] = [
    {
        "name": "organism",
        "in": "query",
        "required": True,
        "description": "Organism identifier (e.g. `cchf`, `mpox`).",
        "schema": _organism_schema,
    },
    {
        "name": "fields",
        "in": "query",
        "required": False,
        "description": "Comma-separated metadata columns to include in the response.",
        "schema": {"type": "string", "example": "accessionVersion,country,date"},
    },
    {
        "name": "limit",
        "in": "query",
        "required": False,
        "description": "Maximum number of records to return.",
        "schema": {"type": "integer", "example": 100},
    },
    {
        "name": "offset",
        "in": "query",
        "required": False,
        "description": "Number of records to skip (pagination).",
        "schema": {"type": "integer", "example": 0},
    },
    {
        "name": "format",
        "in": "query",
        "required": False,
        "description": "Response format. Maps to LAPIS `dataFormat`.",
        "schema": {"type": "string", "enum": ["json", "ndjson", "tsv", "csv"]},
    },
    {
        "name": "download",
        "in": "query",
        "required": False,
        "description": "Set to `true` to add a `Content-Disposition: attachment` header.",
        "schema": {"type": "boolean"},
    },
    {
        "name": "include",
        "in": "query",
        "required": False,
        "description": (
            "Override implicit version defaults (`versionStatus=LATEST_VERSION`, "
            "`isRevocation=false`). Repeatable. "
            "Valid values: `revoked`, `older-versions`, `all`."
        ),
        "schema": {"type": "string", "enum": ["revoked", "older-versions", "all"]},
    },
    {
        "name": "reference",
        "in": "query",
        "required": False,
        "description": "Reference sequence name (relevant for multi-segment organisms).",
        "schema": {"type": "string"},
    },
]

_SEQUENCE_FORMAT_PARAMS: list[dict] = [
    p if p["name"] != "format"
    else {
        **p,
        "schema": {"type": "string", "enum": ["json", "ndjson", "fasta"]},
    }
    for p in _COMMON_CONTROL_PARAMS
]

_POST_BODY_SCHEMA: dict = {
    "type": "object",
    "required": ["organism"],
    "additionalProperties": {
        "description": (
            "Any additional key is treated as a metadata-column filter and forwarded to LAPIS."
        ),
    },
    "properties": {
        "organism": {"type": "string", "example": "cchf"},
        "fields": {
            "description": "Metadata columns to return. String (comma-separated) or array.",
            "oneOf": [
                {"type": "string", "example": "accessionVersion,country"},
                {"type": "array", "items": {"type": "string"}, "example": ["accessionVersion", "country"]},
            ],
        },
        "limit": {"type": "integer", "example": 100},
        "offset": {"type": "integer", "example": 0},
        "format": {"type": "string", "enum": ["json", "ndjson", "tsv", "csv"]},
        "download": {"type": "boolean"},
        "include": {
            "description": "Override implicit version defaults. String or array.",
            "oneOf": [
                {"type": "string", "enum": ["revoked", "older-versions", "all"]},
                {
                    "type": "array",
                    "items": {"type": "string", "enum": ["revoked", "older-versions", "all"]},
                },
            ],
        },
        "reference": {"type": "string"},
    },
}

_POST_REQUEST_BODY: dict = {
    "content": {
        "application/json": {
            "schema": _POST_BODY_SCHEMA,
            "example": {
                "organism": "cchf",
                "country": "Switzerland",
                "fields": ["country", "date"],
                "limit": 1000,
            },
        },
        "application/x-www-form-urlencoded": {
            "schema": {"type": "object", "additionalProperties": {"type": "string"}},
            "description": "Form-encoded variant (same keys as the JSON body).",
        },
    }
}

app = FastAPI(
    title="Loculus query-service",
    version="1",
    description=(
        "Proxy between website/CLI and organism-specific LAPIS instances.\n\n"
        "**Implicit defaults** applied to every query unless overridden:\n"
        "- `versionStatus = LATEST_VERSION`\n"
        "- `isRevocation = false`\n\n"
        "Override with `include=revoked`, `include=older-versions`, or `include=all`.\n\n"
        "Any query parameter not listed in a route's documented parameters is treated as a "
        "**metadata-column filter** and forwarded to LAPIS verbatim."
    ),
)



@app.on_event("startup")
async def _open_client() -> None:
    app.state.client = httpx.AsyncClient(
        timeout=httpx.Timeout(UPSTREAM_TIMEOUT_SECONDS),
        follow_redirects=False,
    )


@app.on_event("shutdown")
async def _close_client() -> None:
    await app.state.client.aclose()


@app.get("/healthz", include_in_schema=False)
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Endpoint routing
# ---------------------------------------------------------------------------



# ---------------------------------------------------------------------------
# Param normalisation and forwarding
# ---------------------------------------------------------------------------


def _validate_organism(organism: str | None) -> str:
    if not organism:
        raise HTTPException(status_code=400, detail="organism is required")
    if not ORGANISM_RE.match(organism):
        raise HTTPException(
            status_code=400, detail=f"invalid organism: {organism!r}"
        )
    return organism


def _apply_version_defaults(
    params: dict[str, Any], includes: list[str]
) -> dict[str, Any]:
    """Merge implicit version filters into params unless an override applies."""
    has_explicit_version = any(k in params for k in VERSION_OVERRIDE_KEYS)
    if has_explicit_version:
        return params

    invalid = [v for v in includes if v not in VALID_INCLUDES]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"unknown include= value(s): {invalid!r} "
            f"(valid: {sorted(VALID_INCLUDES)})",
        )

    out = dict(params)
    if "all" not in includes and "older-versions" not in includes:
        out.setdefault("versionStatus", "LATEST_VERSION")
    if "all" not in includes and "revoked" not in includes:
        out.setdefault("isRevocation", "false")
    return out


def _translate_for_lapis(params: dict[str, Any]) -> dict[str, Any]:
    """Strip our control-only keys and rename format/download to LAPIS names."""
    out: dict[str, Any] = {}
    for k, v in params.items():
        if k in CONTROL_PARAMS and k not in PASS_THROUGH:
            if k == "format":
                out["dataFormat"] = v
            elif k == "download":
                out["downloadAsFile"] = (
                    "true" if _parse_bool(v, default=False) else "false"
                )
            # else: organism/include/aligned/segment/proteinName/column —
            # consumed by routing, never forwarded.
            continue
        out[k] = v
    return out


def _includes_from_params(raw_includes: list[str] | str | None) -> list[str]:
    if raw_includes is None:
        return []
    if isinstance(raw_includes, str):
        return [s for s in raw_includes.split(",") if s]
    return [str(s) for s in raw_includes]


# ---------------------------------------------------------------------------
# Forwarding
# ---------------------------------------------------------------------------


async def _forward(
    *,
    method: str,
    organism: str,
    lapis_path: str,
    request_headers: dict[str, str],
    forward_params: dict[str, Any] | None,
    forward_body: bytes | None,
) -> Response:
    upstream_base = LAPIS_SERVICE_TEMPLATE.format(organism=organism)
    upstream_url = f"{upstream_base}{lapis_path}"

    headers = {k: v for k, v in request_headers.items() if k.lower() not in HOP_BY_HOP}

    client: httpx.AsyncClient = app.state.client
    upstream_req = client.build_request(
        method,
        upstream_url,
        headers=headers,
        params=forward_params,
        content=forward_body,
    )
    try:
        upstream_resp = await client.send(upstream_req, stream=True)
    except httpx.RequestError as exc:
        logger.warning("upstream %s %s failed: %s", method, upstream_url, exc)
        raise HTTPException(status_code=502, detail="upstream unreachable") from exc

    response_headers = {
        k: v for k, v in upstream_resp.headers.items() if k.lower() not in HOP_BY_HOP
    }

    async def body_iter() -> AsyncIterator[bytes]:
        try:
            async for chunk in upstream_resp.aiter_raw():
                yield chunk
        finally:
            await upstream_resp.aclose()

    return StreamingResponse(
        body_iter(),
        status_code=upstream_resp.status_code,
        headers=response_headers,
    )


# ---------------------------------------------------------------------------
# v1 routes
# ---------------------------------------------------------------------------

async def _handle(request: Request, lapis_path: str) -> Response:
    """Apply organism validation, version defaults, and forward to LAPIS."""
    if request.method == "GET":
        params: dict[str, Any] = dict(request.query_params)
        includes = _includes_from_params(request.query_params.getlist("include"))
    else:
        # POST body is flat: control keys at top level, everything else is a
        # metadata-column filter. We accept either JSON (for programmatic
        # callers) or form-encoded (for browser-driven downloads that
        # submit an HTML form with method=POST). Body wins on conflicts
        # with the query string.
        params = dict(request.query_params)
        content_type = request.headers.get("content-type", "")
        if "application/x-www-form-urlencoded" in content_type:
            form = await request.form()
            # Form fields like `fields=a&fields=b&fields=c` repeat the key.
            # Collapse to a list when there's more than one, scalar otherwise.
            body: dict[str, Any] = {}
            for k in form.keys():
                values = form.getlist(k)
                body[k] = values if len(values) > 1 else values[0]
        else:
            raw = await request.body()
            try:
                body = json.loads(raw) if raw else {}
            except json.JSONDecodeError as exc:
                raise HTTPException(
                    status_code=400, detail="invalid JSON body"
                ) from exc
            if not isinstance(body, dict):
                raise HTTPException(
                    status_code=400, detail="POST body must be a JSON object"
                )

        for k, v in body.items():
            params[k] = v
        # `include` may come from either the query string (typical for the
        # website's POST hooks) or the body (for callers using the envelope
        # / form-encoded shapes).
        includes = _includes_from_params(
            body.get("include") or request.query_params.getlist("include")
        )

    organism = _validate_organism(params.get("organism"))
    params.pop("organism", None)
    params.pop("include", None)

    params = _apply_version_defaults(params, includes)
    forward = _translate_for_lapis(params)

    if request.method == "GET":
        return await _forward(
            method="GET",
            organism=organism,
            lapis_path=lapis_path,
            request_headers=dict(request.headers),
            forward_params=forward,
            forward_body=None,
        )

    # POST: rebuild a flat LAPIS body. fields stays as a list.
    flat: dict[str, Any] = {}
    for k, v in forward.items():
        if k == "fields" and isinstance(v, str):
            flat[k] = [s.strip() for s in v.split(",") if s.strip()]
        else:
            flat[k] = v
    body_bytes = json.dumps(flat).encode()
    headers = {
        k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP
    }
    headers["content-type"] = "application/json"
    return await _forward(
        method="POST",
        organism=organism,
        lapis_path=lapis_path,
        request_headers=headers,
        forward_params=None,
        forward_body=body_bytes,
    )


@app.get(
    "/v1/info",
    tags=["Metadata Schema"],
    summary="Metadata field definitions",
    description=(
        "Returns all metadata fields configured for the organism, with their LAPIS type. "
        "Proxies to LAPIS `/sample/databaseConfig`."
    ),
    openapi_extra={
        "parameters": [p for p in _COMMON_CONTROL_PARAMS if p["name"] in {"organism", "reference"}]
    },
)
async def info(request: Request) -> Response:
    organism = _validate_organism(request.query_params.get("organism"))
    # Skip version-default injection — databaseConfig is a schema endpoint, not a data query.
    return await _forward(
        method="GET",
        organism=organism,
        lapis_path="/sample/databaseConfig",
        request_headers=dict(request.headers),
        forward_params={k: v for k, v in request.query_params.items() if k != "organism"},
        forward_body=None,
    )


_AGGREGATED_DESC = (
    "Count sequences matching the given filters, grouped by requested fields. "
    "Any query parameter not listed here is treated as a metadata-column filter."
)


@app.get(
    "/v1/aggregated",
    tags=["Data queries"],
    summary="Aggregated counts",
    description=_AGGREGATED_DESC,
    openapi_extra={"parameters": _COMMON_CONTROL_PARAMS},
)
@app.post(
    "/v1/aggregated",
    tags=["Data queries"],
    summary="Aggregated counts",
    description=_AGGREGATED_DESC,
    openapi_extra={"requestBody": _POST_REQUEST_BODY},
)
async def aggregated(request: Request) -> Response:
    return await _handle(request, "/sample/aggregated")


_DETAILS_DESC = (
    "Return per-sequence metadata records matching the given filters. "
    "Any query parameter not listed here is treated as a metadata-column filter."
)


@app.get(
    "/v1/metadata",
    tags=["Data queries"],
    summary="Sequence metadata",
    description=_DETAILS_DESC,
    openapi_extra={"parameters": _COMMON_CONTROL_PARAMS},
)
@app.post(
    "/v1/metadata",
    tags=["Data queries"],
    summary="Sequence metadata",
    description=_DETAILS_DESC,
    openapi_extra={"requestBody": _POST_REQUEST_BODY},
)
async def details(request: Request) -> Response:
    return await _handle(request, "/sample/details")


_MUTATIONS_DESC = (
    "Return nucleotide mutation frequencies for sequences matching the given filters. "
    "Any query parameter not listed here is treated as a metadata-column filter."
)


@app.get(
    "/v1/mutations",
    tags=["Mutations & insertions"],
    summary="Nucleotide mutations",
    description=_MUTATIONS_DESC,
    openapi_extra={"parameters": _COMMON_CONTROL_PARAMS},
)
@app.post(
    "/v1/mutations",
    tags=["Mutations & insertions"],
    summary="Nucleotide mutations",
    description=_MUTATIONS_DESC,
    openapi_extra={"requestBody": _POST_REQUEST_BODY},
)
async def mutations(request: Request) -> Response:
    return await _handle(request, "/sample/nucleotideMutations")


_AA_MUTATIONS_DESC = (
    "Return amino-acid mutation frequencies for sequences matching the given filters. "
    "Any query parameter not listed here is treated as a metadata-column filter."
)


@app.get(
    "/v1/aaMutations",
    tags=["Mutations & insertions"],
    summary="Amino-acid mutations",
    description=_AA_MUTATIONS_DESC,
    openapi_extra={"parameters": _COMMON_CONTROL_PARAMS},
)
@app.post(
    "/v1/aaMutations",
    tags=["Mutations & insertions"],
    summary="Amino-acid mutations",
    description=_AA_MUTATIONS_DESC,
    openapi_extra={"requestBody": _POST_REQUEST_BODY},
)
async def aa_mutations(request: Request) -> Response:
    return await _handle(request, "/sample/aminoAcidMutations")


_INSERTIONS_DESC = (
    "Return nucleotide insertion frequencies for sequences matching the given filters. "
    "Any query parameter not listed here is treated as a metadata-column filter."
)


@app.get(
    "/v1/insertions",
    tags=["Mutations & insertions"],
    summary="Nucleotide insertions",
    description=_INSERTIONS_DESC,
    openapi_extra={"parameters": _COMMON_CONTROL_PARAMS},
)
@app.post(
    "/v1/insertions",
    tags=["Mutations & insertions"],
    summary="Nucleotide insertions",
    description=_INSERTIONS_DESC,
    openapi_extra={"requestBody": _POST_REQUEST_BODY},
)
async def insertions(request: Request) -> Response:
    return await _handle(request, "/sample/nucleotideInsertions")


_AA_INSERTIONS_DESC = (
    "Return amino-acid insertion frequencies for sequences matching the given filters. "
    "Any query parameter not listed here is treated as a metadata-column filter."
)


@app.get(
    "/v1/aaInsertions",
    tags=["Mutations & insertions"],
    summary="Amino-acid insertions",
    description=_AA_INSERTIONS_DESC,
    openapi_extra={"parameters": _COMMON_CONTROL_PARAMS},
)
@app.post(
    "/v1/aaInsertions",
    tags=["Mutations & insertions"],
    summary="Amino-acid insertions",
    description=_AA_INSERTIONS_DESC,
    openapi_extra={"requestBody": _POST_REQUEST_BODY},
)
async def aa_insertions(request: Request) -> Response:
    return await _handle(request, "/sample/aminoAcidInsertions")


_ALIGNED_SEQ_DESC = (
    "Stream aligned nucleotide sequences (FASTA or NDJSON) matching the given filters. "
    "For multi-segment organisms use `/v1/alignedSequences/{segment}`. "
    "Any query parameter not listed here is treated as a metadata-column filter."
)


@app.get(
    "/v1/alignedSequences",
    tags=["Sequences"],
    summary="Aligned nucleotide sequences (default segment)",
    description=_ALIGNED_SEQ_DESC,
    openapi_extra={"parameters": _SEQUENCE_FORMAT_PARAMS},
)
@app.post(
    "/v1/alignedSequences",
    tags=["Sequences"],
    summary="Aligned nucleotide sequences (default segment)",
    description=_ALIGNED_SEQ_DESC,
    openapi_extra={"requestBody": _POST_REQUEST_BODY},
)
async def aligned_sequences(request: Request) -> Response:
    return await _handle(request, "/sample/alignedNucleotideSequences")


_ALIGNED_SEQ_SEG_DESC = (
    "Stream aligned nucleotide sequences for a specific segment of a multi-segment organism. "
    "Any query parameter not listed here is treated as a metadata-column filter."
)


@app.get(
    "/v1/alignedSequences/{segment}",
    tags=["Sequences"],
    summary="Aligned nucleotide sequences (named segment)",
    description=_ALIGNED_SEQ_SEG_DESC,
    openapi_extra={"parameters": _SEQUENCE_FORMAT_PARAMS},
)
@app.post(
    "/v1/alignedSequences/{segment}",
    tags=["Sequences"],
    summary="Aligned nucleotide sequences (named segment)",
    description=_ALIGNED_SEQ_SEG_DESC,
    openapi_extra={"requestBody": _POST_REQUEST_BODY},
)
async def aligned_sequences_segment(segment: str, request: Request) -> Response:
    return await _handle(request, f"/sample/alignedNucleotideSequences/{segment}")


_UNALIGNED_SEQ_DESC = (
    "Stream unaligned nucleotide sequences (FASTA or NDJSON) matching the given filters. "
    "For multi-segment organisms use `/v1/unalignedSequences/{segment}`. "
    "Any query parameter not listed here is treated as a metadata-column filter."
)


@app.get(
    "/v1/unalignedSequences",
    tags=["Sequences"],
    summary="Unaligned nucleotide sequences (default segment)",
    description=_UNALIGNED_SEQ_DESC,
    openapi_extra={"parameters": _SEQUENCE_FORMAT_PARAMS},
)
@app.post(
    "/v1/unalignedSequences",
    tags=["Sequences"],
    summary="Unaligned nucleotide sequences (default segment)",
    description=_UNALIGNED_SEQ_DESC,
    openapi_extra={"requestBody": _POST_REQUEST_BODY},
)
async def unaligned_sequences(request: Request) -> Response:
    return await _handle(request, "/sample/unalignedNucleotideSequences")


_UNALIGNED_SEQ_SEG_DESC = (
    "Stream unaligned nucleotide sequences for a specific segment of a multi-segment organism. "
    "Any query parameter not listed here is treated as a metadata-column filter."
)


@app.get(
    "/v1/unalignedSequences/{segment}",
    tags=["Sequences"],
    summary="Unaligned nucleotide sequences (named segment)",
    description=_UNALIGNED_SEQ_SEG_DESC,
    openapi_extra={"parameters": _SEQUENCE_FORMAT_PARAMS},
)
@app.post(
    "/v1/unalignedSequences/{segment}",
    tags=["Sequences"],
    summary="Unaligned nucleotide sequences (named segment)",
    description=_UNALIGNED_SEQ_SEG_DESC,
    openapi_extra={"requestBody": _POST_REQUEST_BODY},
)
async def unaligned_sequences_segment(segment: str, request: Request) -> Response:
    return await _handle(request, f"/sample/unalignedNucleotideSequences/{segment}")


_AA_SEQ_DESC = (
    "Stream aligned amino-acid sequences for a named protein. "
    "Any query parameter not listed here is treated as a metadata-column filter."
)


@app.get(
    "/v1/aaSequences/{protein_name}",
    tags=["Sequences"],
    summary="Aligned amino-acid sequences",
    description=_AA_SEQ_DESC,
    openapi_extra={"parameters": _SEQUENCE_FORMAT_PARAMS},
)
@app.post(
    "/v1/aaSequences/{protein_name}",
    tags=["Sequences"],
    summary="Aligned amino-acid sequences",
    description=_AA_SEQ_DESC,
    openapi_extra={"requestBody": _POST_REQUEST_BODY},
)
async def aa_sequences(protein_name: str, request: Request) -> Response:
    return await _handle(request, f"/sample/alignedAminoAcidSequences/{protein_name}")


@app.get(
    "/v1/lineageDefinition",
    tags=["Metadata Schema"],
    summary="Lineage definition",
    description="Returns the lineage hierarchy definition for a given metadata column.",
    openapi_extra={
        "parameters": [
            p for p in _COMMON_CONTROL_PARAMS
            if p["name"] in {"organism", "reference"}
        ] + [
            {
                "name": "column",
                "in": "query",
                "required": True,
                "description": "Metadata column that holds lineage values.",
                "schema": {"type": "string", "example": "lineage"},
            }
        ]
    },
)
async def lineage_definition(request: Request) -> Response:
    column = request.query_params.get("column")
    if not column:
        raise HTTPException(
            status_code=400, detail="lineageDefinition requires column"
        )
    return await _handle(request, f"/sample/lineageDefinition/{column}")
