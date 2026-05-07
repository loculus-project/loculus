# Loculus query-service

Single-deployment HTTP service that sits between callers (the website, the
LAPIS ingress) and the per-organism LAPIS deployments.

For now it is a transparent reverse proxy: a request to

    /{organism}/{lapis_path}

is forwarded to

    http://loculus-lapis-service-{organism}:8080/{lapis_path}

with the same method, query string, headers (minus hop-by-hop), and body, and
the response is streamed back unchanged.

The point of routing through our own service is to give us a place to modify
LAPIS responses later (filter records, redact fields, etc.) without touching
the website or LAPIS.

## Configuration

| Env var                    | Default                                                | Purpose                                                              |
|----------------------------|--------------------------------------------------------|----------------------------------------------------------------------|
| `LAPIS_SERVICE_TEMPLATE`   | `http://loculus-lapis-service-{organism}:8080`         | Upstream URL template; `{organism}` is replaced per request.         |
| `UPSTREAM_TIMEOUT_SECONDS` | `60`                                                   | Per-request timeout to LAPIS.                                        |
| `LOG_LEVEL`                | `INFO`                                                 | Standard `logging` level name.                                       |

## Local dev

```sh
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

## Container build

```sh
docker build -t loculus-query-service:dev .
```
