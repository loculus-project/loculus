"""Helpers for local development and integration-test networking."""

import os
import socket
from collections.abc import Sequence
from typing import Any

LOCAL_TEST_DOMAIN_SUFFIX = ".loculus.test"
LOCAL_TEST_DOMAIN = "loculus.test"

_ORIGINAL_GETADDRINFO = socket.getaddrinfo
_DNS_PATCHED = False


def _env_enabled(name: str) -> bool:
    return os.getenv(name, "").lower() in {"1", "true", "yes", "on"}


def local_test_dns_enabled() -> bool:
    return _env_enabled("LOCULUS_CLI_LOCAL_TEST_DNS")


def verify_tls() -> bool:
    return not _env_enabled("LOCULUS_CLI_ALLOW_INSECURE_LOCAL_TEST_TLS")


def _is_local_test_host(host: object) -> bool:
    return isinstance(host, str) and (
        host == LOCAL_TEST_DOMAIN or host.endswith(LOCAL_TEST_DOMAIN_SUFFIX)
    )


def install_local_test_dns() -> None:
    """Resolve loculus.test names to localhost when explicitly enabled."""
    global _DNS_PATCHED
    if _DNS_PATCHED or not local_test_dns_enabled():
        return

    def getaddrinfo(
        host: str | bytes | None,
        port: str | int | None,
        family: int = 0,
        type: int = 0,
        proto: int = 0,
        flags: int = 0,
    ) -> Sequence[tuple[Any, ...]]:
        if _is_local_test_host(host):
            return _ORIGINAL_GETADDRINFO("127.0.0.1", port, family, type, proto, flags)
        return _ORIGINAL_GETADDRINFO(host, port, family, type, proto, flags)

    socket.getaddrinfo = getaddrinfo
    _DNS_PATCHED = True
