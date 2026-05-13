"""Loculus registration service.

Renders a registration form and creates the user in lldap via its GraphQL
admin API. Designed to be deployed alongside lldap in bundled-LDAP mode.
"""
from __future__ import annotations

import asyncio
import os
import re
from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

import httpx
from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates


LLDAP_URL = os.environ["LLDAP_URL"].rstrip("/")
LLDAP_ADMIN_USERNAME = os.environ["LLDAP_ADMIN_USERNAME"]
LLDAP_ADMIN_PASSWORD = os.environ["LLDAP_ADMIN_PASSWORD"]
LOGIN_URL = os.environ.get("LOGIN_URL", "")
TERMS_MESSAGE = os.environ.get("TERMS_MESSAGE", "")
DEFAULT_GROUP = os.environ.get("DEFAULT_GROUP", "user")

USERNAME_RE = re.compile(r"^[a-z0-9_-]{3,32}$")
# The character classes here are linear (single-char only, no `+`/`*` quantifier
# stacking), but we still cap MAX_EMAIL_LEN before applying the regex to keep
# matching predictably bounded on attacker-supplied input.
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,253}\.[^@\s]{1,253}$")
MAX_EMAIL_LEN = 254


class LldapClient:
    def __init__(self, base_url: str, username: str, password: str) -> None:
        self._base = base_url
        self._username = username
        self._password = password
        self._token: Optional[str] = None
        self._default_group_id: Optional[int] = None
        self._default_group_id_loaded = False
        self._login_lock = asyncio.Lock()
        self._operation_lock = asyncio.Lock()
        self._http = httpx.AsyncClient(base_url=base_url, timeout=15.0)

    async def aclose(self) -> None:
        await self._http.aclose()

    @asynccontextmanager
    async def operation(self) -> AsyncIterator[None]:
        async with self._operation_lock:
            yield

    async def _login(self) -> str:
        # lldap 0.6 expects `username` (not `name`).
        resp = await self._http.post(
            "/auth/simple/login",
            json={"username": self._username, "password": self._password},
        )
        resp.raise_for_status()
        return resp.json()["token"]

    async def _get_token(self) -> str:
        if self._token is not None:
            return self._token

        async with self._login_lock:
            if self._token is None:
                self._token = await self._login()
            return self._token

    async def _refresh_token(self) -> str:
        async with self._login_lock:
            self._token = await self._login()
            return self._token

    async def _gql(self, query: str, variables: dict) -> dict:
        token = await self._get_token()
        resp = await self._http.post(
            "/api/graphql",
            json={"query": query, "variables": variables},
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code == 401:
            # token expired, retry once
            token = await self._refresh_token()
            resp = await self._http.post(
                "/api/graphql",
                json={"query": query, "variables": variables},
                headers={"Authorization": f"Bearer {token}"},
            )
        resp.raise_for_status()
        return resp.json()

    async def _get_default_group_id(self) -> Optional[int]:
        if self._default_group_id_loaded:
            return self._default_group_id

        groups = await self._gql("query { groups { id displayName } }", {})
        self._default_group_id = next(
            (
                g["id"]
                for g in groups["data"]["groups"]
                if g["displayName"] == DEFAULT_GROUP
            ),
            None,
        )
        self._default_group_id_loaded = True
        return self._default_group_id

    async def _set_password(self, user_id: str, password: str) -> None:
        token = await self._get_token()
        process = await asyncio.create_subprocess_exec(
            "lldap_set_password",
            "--base-url",
            f"{self._base}/",
            "--token",
            token,
            "--username",
            user_id,
            "--password",
            password,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=30)
        except asyncio.TimeoutError as exc:
            process.kill()
            await process.communicate()
            raise RuntimeError("Timed out while setting lldap password") from exc

        if process.returncode != 0:
            output = (stderr or stdout).decode(errors="replace").strip()
            raise RuntimeError(f"Failed to set lldap password: {output}")

    async def user_exists(self, user_id: str) -> bool:
        q = "query($id: String!) { user(userId: $id) { id } }"
        body = await self._gql(q, {"id": user_id})
        data = body.get("data")
        if data is None:
            errors = body.get("errors") or []
            if any("Entity not found" in (error.get("message") or "") for error in errors):
                return False
            raise RuntimeError(f"Unexpected lldap GraphQL response: {body}")
        return data.get("user") is not None

    async def email_exists(self, email: str) -> bool:
        q = "query { users { email } }"
        body = await self._gql(q, {})
        return any(
            (u.get("email") or "").lower() == email.lower()
            for u in (body.get("data") or {}).get("users", [])
        )

    async def create_user(
        self,
        user_id: str,
        email: str,
        first_name: str,
        last_name: str,
        organization: str,
        password: str,
    ) -> None:
        gid = await self._get_default_group_id()
        q = """
        mutation($u: CreateUserInput!) {
          createUser(user: $u) { id }
        }
        """
        await self._gql(
            q,
            {
                "u": {
                    "id": user_id,
                    "email": email,
                    "displayName": f"{first_name} {last_name}".strip() or user_id,
                    "firstName": first_name,
                    "lastName": last_name,
                }
            },
        )
        if gid is not None:
            await self._gql(
                "mutation($u: String!, $g: Int!) { addUserToGroup(userId: $u, groupId: $g) { ok } }",
                {"u": user_id, "g": gid},
            )
        await self._set_password(user_id, password)


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = LldapClient(LLDAP_URL, LLDAP_ADMIN_USERNAME, LLDAP_ADMIN_PASSWORD)
    app.state.lldap = client
    try:
        yield
    finally:
        await client.aclose()


app = FastAPI(lifespan=lifespan, title="Loculus registration service")
templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


@app.get("/", response_class=HTMLResponse)
async def form(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        request,
        "register.html",
        {
            "errors": {},
            "values": {},
            "terms_message": TERMS_MESSAGE,
            "login_url": LOGIN_URL,
        },
    )


@app.post("/")
async def submit(
    request: Request,
    username: str = Form(...),
    email: str = Form(...),
    first_name: str = Form(...),
    last_name: str = Form(...),
    organization: str = Form(...),
    password: str = Form(...),
    confirm_password: str = Form(...),
    accept_terms: Optional[str] = Form(None),
):
    errors: dict[str, str] = {}
    values = {
        "username": username,
        "email": email,
        "first_name": first_name,
        "last_name": last_name,
        "organization": organization,
    }
    if not USERNAME_RE.fullmatch(username):
        errors["username"] = "3-32 chars, lowercase letters, digits, _, -"
    if len(email) > MAX_EMAIL_LEN or not EMAIL_RE.fullmatch(email):
        errors["email"] = "Invalid email"
    if not first_name.strip():
        errors["first_name"] = "Required"
    if not last_name.strip():
        errors["last_name"] = "Required"
    if not organization.strip():
        errors["organization"] = "Required"
    if len(password) < 8:
        errors["password"] = "At least 8 characters"
    elif password != confirm_password:
        errors["confirm_password"] = "Passwords do not match"
    if not accept_terms:
        errors["accept_terms"] = "You must accept the terms"

    lldap: LldapClient = request.app.state.lldap
    if not errors:
        async with lldap.operation():
            if await lldap.user_exists(username):
                errors["username"] = "That username is already taken"
            elif await lldap.email_exists(email):
                errors["email"] = "That email is already registered"
            else:
                await lldap.create_user(
                    user_id=username,
                    email=email,
                    first_name=first_name.strip(),
                    last_name=last_name.strip(),
                    organization=organization.strip(),
                    password=password,
                )

    if errors:
        return templates.TemplateResponse(
            request,
            "register.html",
            {
                "errors": errors,
                "values": values,
                "terms_message": TERMS_MESSAGE,
                "login_url": LOGIN_URL,
            },
            status_code=400,
        )

    if LOGIN_URL:
        return RedirectResponse(url=f"{LOGIN_URL}?registered=1", status_code=303)
    return RedirectResponse(url="/?registered=1", status_code=303)
