# Solution Strategy

- Add `/query/{organism}/{versionGroup}/...` endpoints that mirror the LAPIS data endpoints used by the website.
- Document those endpoints in the backend Swagger UI together with the submission endpoints.
- Add a demonstration access filter that augments LAPIS request bodies or query strings with group and version constraints.
- Use `current` for latest-version views and `allVersions` where sequence history or exact accession versions are needed.
- Update website data loading so user-facing sequence data and counts come from `/query`.
