# Loculus query-service

Single-deployment HTTP service that the website and CLI use instead of
talking to LAPIS directly.

## v1 API

```
GET|POST  /v1/aggregated         ?organism=
GET|POST  /v1/details            ?organism=
GET|POST  /v1/mutations          ?organism=                # nucleotide
GET|POST  /v1/aaMutations        ?organism=                # amino acid
GET|POST  /v1/insertions         ?organism=                # nucleotide
GET|POST  /v1/aaInsertions       ?organism=                # amino acid
GET|POST  /v1/sequences          ?organism=&aligned=&segment=
GET|POST  /v1/aaSequences        ?organism=&proteinName=
GET       /v1/info               ?organism=
GET       /v1/lineageDefinition  ?organism=&column=
```

`organism` is required and single-valued.

### Reserved control params

`organism`, `format`, `download`, `fields`, `limit`, `offset`, `include`,
`aligned`, `segment`, `reference`, `proteinName`, `column`.

Anything else is treated as a metadata-column filter and forwarded to
LAPIS as-is.

`format` and `download` map to LAPIS's `dataFormat` and `downloadAsFile`.

### Implicit defaults

By default, every query applies:

```
versionStatus = LATEST_VERSION
isRevocation  = false
```

Opt out with the repeatable `include=` enum:

```
include=revoked          # also revocations
include=older-versions   # also non-latest versions
include=all              # both
```

If the caller specifies any version-related filter
(`accessionVersion`, `version`, `versionStatus`), the implicit defaults
are dropped — the explicit filter wins.

### POST body

Flat. Reserved control keys live at the top level; everything else is a
metadata-column filter and is forwarded verbatim. Matches LAPIS's own
POST body shape, so existing flat bodies migrate as-is:

```json
{
  "organism": "cchf",
  "country":  "Switzerland",
  "fields":   ["country", "date"],
  "limit":    1000
}
```

## Configuration

| Env var                    | Default                                            |
|----------------------------|----------------------------------------------------|
| `LAPIS_SERVICE_TEMPLATE`   | `http://loculus-lapis-service-{organism}:8080`     |
| `UPSTREAM_TIMEOUT_SECONDS` | `60`                                               |
| `LOG_LEVEL`                | `INFO`                                             |

## Local dev

```sh
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

## Container build

```sh
docker build -t loculus-query-service:dev .
```
