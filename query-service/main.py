"""
Loculus query-service.

Right now this is a transparent reverse proxy in front of the per-organism
LAPIS deployments. Requests of the form

    /{organism}/{lapis_path}

are forwarded to

    http://loculus-lapis-service-{organism}:8080/{lapis_path}

The point of having our own hop in front of LAPIS is so that future versions
can rewrite responses (filter records, redact fields, inject metadata, etc.)
without changing the website or LAPIS itself.
"""

from __future__ import annotations

import logging
import os
import re
from collections.abc import AsyncIterator

import httpx
from fastapi import FastAPI, Request, Response
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

# DNS labels: lowercase letters, digits, hyphens; must start with a letter.
# Loculus organism keys follow this convention.
ORGANISM_RE = re.compile(r"^[a-z][a-z0-9-]*$")

# Hop-by-hop headers that must not be forwarded (RFC 7230 §6.1) plus a few
# that don't make sense to copy across an HTTP-to-HTTP proxy.
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


@app.api_route(
    "/{organism}/{lapis_path:path}",
    methods=["GET", "POST", "HEAD", "OPTIONS"],
)
async def proxy(organism: str, lapis_path: str, request: Request) -> Response:
    if not ORGANISM_RE.match(organism):
        return Response(status_code=404, content=b"unknown organism")

    upstream_base = LAPIS_SERVICE_TEMPLATE.format(organism=organism)
    upstream_url = f"{upstream_base}/{lapis_path}"
    if request.url.query:
        upstream_url = f"{upstream_url}?{request.url.query}"

    request_headers = {
        k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP
    }
    body = await request.body()

    client: httpx.AsyncClient = app.state.client
    upstream_req = client.build_request(
        request.method, upstream_url, headers=request_headers, content=body
    )

    try:
        upstream_resp = await client.send(upstream_req, stream=True)
    except httpx.RequestError as exc:
        logger.warning("upstream %s %s failed: %s", request.method, upstream_url, exc)
        return Response(status_code=502, content=b"upstream unreachable")

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
