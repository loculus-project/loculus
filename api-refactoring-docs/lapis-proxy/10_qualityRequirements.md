# Quality Requirements

- Demonstrability: the API structure should make backend-owned query endpoints easy to inspect in Swagger.
- Security example: private sequence data must not leak through tables, details, downloads, or counts.
- Performance: backend work should be limited to auth-derived filter construction and request forwarding.
- Compatibility: query endpoints should stay close to LAPIS endpoint shapes used by the website.
