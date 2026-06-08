# Constraints

- The demonstration authorization must be enforced in the backend, not only in the website.
- LAPIS remains the query engine; the backend should add access constraints and proxy requests rather than reimplementing LAPIS queries.
- Group access must be expressed as a LAPIS filter so that filtering work stays in LAPIS.
- Existing organism-specific configuration remains the source of truth for LAPIS URLs and metadata fields.
