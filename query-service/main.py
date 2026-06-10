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
    GET|POST  /v1/alignedSequences              ?organism= [&segment=<name>] [&reference=<name>]
    GET|POST  /v1/unalignedSequences            ?organism= [&segment=<name>] [&reference=<name>]
    GET|POST  /v1/aaSequences/{proteinName}     ?organism=
    GET       /v1/info                          ?organism=
    GET       /v1/lineageDefinition             ?organism=&column=
    GET       /v1/organisms                     (returns organism→segment/reference config)

Reserved control params:
    organism, format, download, fields, limit, offset, include,
    segment, reference

Segment/reference routing logic (mirrors preprocessing set_sequence_name):
    single-segment, single-reference   → no path suffix
    multi-segment,  single-reference   → /{segment}
    single-segment, multi-reference    → /{reference}
    multi-segment,  multi-reference    → /{segment}-{reference}

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

import copy
import json
import logging
import os
import re
from collections.abc import AsyncIterator
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("query-service")

LAPIS_SERVICE_TEMPLATE = os.environ.get(
    "LAPIS_SERVICE_TEMPLATE", "http://loculus-lapis-service-{organism}:8080"
)
UPSTREAM_TIMEOUT_SECONDS = float(os.environ.get("UPSTREAM_TIMEOUT_SECONDS", "60"))

# ---------------------------------------------------------------------------
# Organism config — loaded from a JSON file mounted via Kubernetes ConfigMap.
# Shape: { "<organism-key>": { "segments": [{ "name": str, "references": [str] }] } }
# Fallback: ORGANISMS / REFERENCE_NAMES env vars (kept for local development).
# ---------------------------------------------------------------------------
ORGANISM_CONFIG_FILE = os.environ.get("ORGANISM_CONFIG_FILE", "")
ORGANISM_CONFIG: dict[str, Any] = {}

if ORGANISM_CONFIG_FILE:
    try:
        with open(ORGANISM_CONFIG_FILE) as _f:
            ORGANISM_CONFIG = json.load(_f)
        logger.info("Loaded organism config from %s (%d organisms)", ORGANISM_CONFIG_FILE, len(ORGANISM_CONFIG))
    except (OSError, json.JSONDecodeError) as _exc:
        logger.warning("Could not load organism config %r: %s", ORGANISM_CONFIG_FILE, _exc)

# Derived organism list — used for the Swagger UI enum and organism validation.
ORGANISMS: list[str] = list(ORGANISM_CONFIG.keys()) or [
    o.strip() for o in os.environ.get("ORGANISMS", "").split(",") if o.strip()
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
        "segment",
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

# All segment names that appear in multi-segment organisms (excluding "main").
_ALL_SEGMENT_NAMES: list[str] = sorted({
    seg["name"]
    for cfg in ORGANISM_CONFIG.values()
    for seg in cfg.get("segments", [])
    if len(cfg.get("segments", [])) > 1 and seg["name"] != "main"
})

# All reference names that appear in segments with multiple references (excluding "singleReference").
_ALL_REFERENCE_NAMES: list[str] = sorted({
    ref
    for cfg in ORGANISM_CONFIG.values()
    for seg in cfg.get("segments", [])
    for ref in seg.get("references", [])
    if len(seg.get("references", [])) > 1 and ref != "singleReference"
})

_segment_schema: dict = {"type": "string"}
_reference_schema: dict = {"type": "string"}

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
]

# Sequence endpoints additionally accept `segment` and `reference` for routing.
_SEQUENCE_ROUTING_PARAMS: list[dict] = [
    {
        "name": "segment",
        "in": "query",
        "required": False,
        "description": (
            "For multi-segment organisms: the segment to retrieve (e.g. `L`, `M`, `S`). "
            "Omit for single-segment organisms."
        ),
        "schema": _segment_schema,
    },
    {
        "name": "reference",
        "in": "query",
        "required": False,
        "description": (
            "For organisms with multiple references per segment: the reference to align to. "
            "Omit when each segment has only one reference."
        ),
        "schema": _reference_schema,
    },
]

_SEQUENCE_FORMAT_PARAMS: list[dict] = [
    p if p["name"] != "format"
    else {
        **p,
        "schema": {"type": "string", "enum": ["json", "ndjson", "fasta"]},
    }
    for p in _COMMON_CONTROL_PARAMS
] + _SEQUENCE_ROUTING_PARAMS

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
        "segment": {"type": "string", "description": "Segment name for multi-segment organisms."},
        "reference": {"type": "string", "description": "Reference name for multi-reference organisms."},
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
    # Disable auto-generated docs so we can serve a custom Swagger UI with
    # organism-aware segment/reference dropdowns.
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)



def _parse_bool(value: Any, *, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in ("1", "true", "yes")
    return default


def _resolve_sequence_name(
    organism: str,
    segment: str | None,
    reference: str | None,
) -> str | None:
    """Resolve the LAPIS sequence path component from organism config.

    Falls back to using `segment` or `reference` directly when the organism
    is not in the config (e.g. local dev without a config file).
    """
    if organism in ORGANISM_CONFIG:
        return get_lapis_sequence_name(ORGANISM_CONFIG[organism], segment, reference)
    # Fallback: use whichever of segment/reference was provided
    return segment or reference


def get_lapis_sequence_name(
    cfg: dict[str, Any],
    segment: str | None,
    reference: str | None,
) -> str | None:
    """Return the LAPIS segment path component for a nucleotide sequence request.

    Mirrors the Helm mergeReferenceGenomes template logic:
      (single-ref, any)    → segment name (or None for single-segment)
      (multi-ref, 1-seg)   → reference name
      (multi-ref, multi-seg) → "{segment}-{reference}"
    """
    segments = cfg.get("segments", [])
    single_segment = len(segments) == 1

    if single_segment:
        seg = segments[0]
        single_reference = len(seg.get("references", [])) == 1
        if single_reference:
            return None  # single segment, single reference: no LAPIS path suffix
        return reference  # single segment, multi-reference: use reference name
    else:
        seg_name = segment or (segments[0]["name"] if segments else None)
        if seg_name is None:
            return None
        seg = next((s for s in segments if s["name"] == seg_name), None)
        if seg is None:
            return seg_name
        single_reference = len(seg.get("references", [])) == 1
        if single_reference:
            return seg_name  # multi-segment, single reference: use segment name
        ref_name = reference or (seg["references"][0] if seg.get("references") else None)
        if ref_name is None:
            return seg_name
        return f"{seg_name}-{ref_name}"  # multi-segment, multi-reference


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


@app.get("/v1/organisms", include_in_schema=False)
async def organisms() -> dict[str, Any]:
    """Return the organism→segments/references config (used by the custom Swagger UI)."""
    return ORGANISM_CONFIG


def _build_organism_spec(organism: str) -> dict[str, Any]:
    """Return the OpenAPI spec filtered to a single organism's segments/references."""
    spec = copy.deepcopy(app.openapi())

    if not (organism and organism in ORGANISM_CONFIG):
        return spec

    cfg = ORGANISM_CONFIG[organism]
    segs = cfg.get("segments", [])
    multi_segment = len(segs) > 1
    has_multi_ref = any(len(s.get("references", [])) > 1 for s in segs)

    seg_enum = [s["name"] for s in segs] if multi_segment else []
    ref_enum = sorted({
        ref
        for s in segs
        for ref in s.get("references", [])
        if len(s.get("references", [])) > 1
    })

    sequence_paths = {"/v1/alignedSequences", "/v1/unalignedSequences"}
    for path, path_item in spec.get("paths", {}).items():
        is_seq = path in sequence_paths
        for method_item in path_item.values():
            if not isinstance(method_item, dict):
                continue
            new_params = []
            for p in method_item.get("parameters", []):
                name = p.get("name")
                if name == "organism":
                    # Lock to the selected organism so every form is pre-filled.
                    new_params.append({**p, "schema": {"type": "string", "enum": [organism]}})
                elif is_seq and name == "segment":
                    if multi_segment:
                        new_params.append({**p, "schema": {"type": "string", "enum": seg_enum}})
                    # omit for single-segment organisms
                elif is_seq and name == "reference":
                    if has_multi_ref:
                        new_params.append({**p, "schema": {"type": "string", "enum": ref_enum}})
                    # omit when no segment has multiple references
                else:
                    new_params.append(p)
            method_item["parameters"] = new_params

    return spec


@app.get("/openapi.json", include_in_schema=False)
async def openapi_spec(organism: str = "") -> JSONResponse:
    return JSONResponse(_build_organism_spec(organism))


_SWAGGER_HTML = """<!DOCTYPE html>
<html>
<head>
  <title>Loculus query-service API</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body {{ margin: 0; }}
    .org-bar {{
      background: #1b1b1b; padding: 10px 20px;
      display: flex; align-items: center; gap: 12px; font-family: sans-serif;
    }}
    .org-bar label {{ color: #fff; font-size: 14px; }}
    .org-bar select {{
      padding: 4px 8px; font-size: 14px; border-radius: 4px;
      border: 1px solid #555; background: #2d2d2d; color: #fff; cursor: pointer;
    }}
  </style>
</head>
<body>
<div class="org-bar">
  <label for="org-select">Filter by organism:</label>
  <select id="org-select" onchange="window.location.href='/docs'+(this.value?'?organism='+encodeURIComponent(this.value):'')">
    <option value="">All organisms</option>
    {organism_options}
  </select>
</div>
<div id="swagger-ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
  SwaggerUIBundle({{
    spec: {spec_json},
    dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis],
    layout: 'BaseLayout',
  }});
</script>
</body>
</html>"""


@app.get("/docs", include_in_schema=False)
async def swagger_ui(organism: str = "") -> HTMLResponse:
    spec = _build_organism_spec(organism)
    # Escape </script> sequences that would break HTML parsing
    spec_json = json.dumps(spec).replace("</", "<\\/")
    options = "\n    ".join(
        f'<option value="{o}"{" selected" if o == organism else ""}>{o}</option>'
        for o in ORGANISMS
    )
    return HTMLResponse(_SWAGGER_HTML.format(organism_options=options, spec_json=spec_json))


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
    "For multi-segment organisms set `segment` to the desired segment (e.g. `L`, `S`). "
    "For organisms with multiple references per segment, also set `reference`. "
    "Omit both for single-segment single-reference organisms. "
    "Any query parameter not listed here is treated as a metadata-column filter."
)


@app.get(
    "/v1/alignedSequences",
    tags=["Sequences"],
    summary="Aligned nucleotide sequences",
    description=_ALIGNED_SEQ_DESC,
    openapi_extra={"parameters": _SEQUENCE_FORMAT_PARAMS},
)
@app.post(
    "/v1/alignedSequences",
    tags=["Sequences"],
    summary="Aligned nucleotide sequences",
    description=_ALIGNED_SEQ_DESC,
    openapi_extra={"requestBody": _POST_REQUEST_BODY},
)
async def aligned_sequences(request: Request) -> Response:
    segment = request.query_params.get("segment")
    reference = request.query_params.get("reference")
    organism = request.query_params.get("organism") or ""
    lapis_name = _resolve_sequence_name(organism, segment, reference)
    lapis_path = (
        f"/sample/alignedNucleotideSequences/{lapis_name}"
        if lapis_name
        else "/sample/alignedNucleotideSequences"
    )
    return await _handle(request, lapis_path)


_UNALIGNED_SEQ_DESC = (
    "Stream unaligned nucleotide sequences (FASTA or NDJSON) matching the given filters. "
    "For multi-segment organisms set `segment` to the desired segment (e.g. `L`, `S`). "
    "For organisms with multiple references per segment, also set `reference`. "
    "Omit both for single-segment single-reference organisms. "
    "Any query parameter not listed here is treated as a metadata-column filter."
)


@app.get(
    "/v1/unalignedSequences",
    tags=["Sequences"],
    summary="Unaligned nucleotide sequences",
    description=_UNALIGNED_SEQ_DESC,
    openapi_extra={"parameters": _SEQUENCE_FORMAT_PARAMS},
)
@app.post(
    "/v1/unalignedSequences",
    tags=["Sequences"],
    summary="Unaligned nucleotide sequences",
    description=_UNALIGNED_SEQ_DESC,
    openapi_extra={"requestBody": _POST_REQUEST_BODY},
)
async def unaligned_sequences(request: Request) -> Response:
    segment = request.query_params.get("segment")
    reference = request.query_params.get("reference")
    organism = request.query_params.get("organism") or ""
    lapis_name = _resolve_sequence_name(organism, segment, reference)
    lapis_path = (
        f"/sample/unalignedNucleotideSequences/{lapis_name}"
        if lapis_name
        else "/sample/unalignedNucleotideSequences"
    )
    return await _handle(request, lapis_path)


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
