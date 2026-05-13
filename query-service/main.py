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
    GET|POST  /v1/details                       ?organism=
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

app = FastAPI(title="Loculus query-service", docs_url=None, redoc_url=None)


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


@app.api_route("/v1/info", methods=["GET"])
async def info(request: Request) -> Response:
    return await _handle(request, "/sample/info")


@app.api_route("/v1/aggregated", methods=["GET", "POST"])
async def aggregated(request: Request) -> Response:
    return await _handle(request, "/sample/aggregated")


@app.api_route("/v1/details", methods=["GET", "POST"])
async def details(request: Request) -> Response:
    return await _handle(request, "/sample/details")


@app.api_route("/v1/mutations", methods=["GET", "POST"])
async def mutations(request: Request) -> Response:
    return await _handle(request, "/sample/nucleotideMutations")


@app.api_route("/v1/aaMutations", methods=["GET", "POST"])
async def aa_mutations(request: Request) -> Response:
    return await _handle(request, "/sample/aminoAcidMutations")


@app.api_route("/v1/insertions", methods=["GET", "POST"])
async def insertions(request: Request) -> Response:
    return await _handle(request, "/sample/nucleotideInsertions")


@app.api_route("/v1/aaInsertions", methods=["GET", "POST"])
async def aa_insertions(request: Request) -> Response:
    return await _handle(request, "/sample/aminoAcidInsertions")


@app.api_route("/v1/alignedSequences", methods=["GET", "POST"])
async def aligned_sequences(request: Request) -> Response:
    return await _handle(request, "/sample/alignedNucleotideSequences")


@app.api_route("/v1/alignedSequences/{segment}", methods=["GET", "POST"])
async def aligned_sequences_segment(segment: str, request: Request) -> Response:
    return await _handle(request, f"/sample/alignedNucleotideSequences/{segment}")


@app.api_route("/v1/unalignedSequences", methods=["GET", "POST"])
async def unaligned_sequences(request: Request) -> Response:
    return await _handle(request, "/sample/unalignedNucleotideSequences")


@app.api_route("/v1/unalignedSequences/{segment}", methods=["GET", "POST"])
async def unaligned_sequences_segment(segment: str, request: Request) -> Response:
    return await _handle(request, f"/sample/unalignedNucleotideSequences/{segment}")


@app.api_route("/v1/aaSequences/{protein_name}", methods=["GET", "POST"])
async def aa_sequences(protein_name: str, request: Request) -> Response:
    return await _handle(request, f"/sample/alignedAminoAcidSequences/{protein_name}")


@app.api_route("/v1/lineageDefinition", methods=["GET"])
async def lineage_definition(request: Request) -> Response:
    column = request.query_params.get("column")
    if not column:
        raise HTTPException(
            status_code=400, detail="lineageDefinition requires column"
        )
    return await _handle(request, f"/sample/lineageDefinition/{column}")
