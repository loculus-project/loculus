# Crosscutting Concepts

- API structure: sequence query and submission APIs share one backend OpenAPI surface, shown through Swagger UI or Scalar.
- Demonstration access control: sequence visibility is expressed as LAPIS-compatible filters.
- Version groups: `current` adds the latest-version constraint; `allVersions` leaves version history visible subject to access control.
- Private landing page: unauthenticated users see a concise private-instance notice and login link.
- Counts: landing-page counts use backend query results so they reflect the current user's visibility.
