# Introduction And Goals

This branch demonstrates a new API structure for sequence reads:

- `/query/{organism}/current/...` returns only latest sequence versions.
- `/query/{organism}/allVersions/...` can return historical versions.
- The backend exposes and documents these endpoints alongside the existing submission APIs.

The main goal is to show the value of a backend-owned query API: one documented API surface, one component for submission and query APIs, and easy access to backend-only context such as submitting groups. Group-specific authentication is implemented as a demonstration of this API architecture.
