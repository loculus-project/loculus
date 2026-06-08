# Risks And Technical Debt

- The website still has a few raw LAPIS call paths that need follow-up before the old proxy can be retired.
- The demonstration access filter depends on the configured group metadata field matching LAPIS data.
- Query endpoint coverage is driven by current website needs, so new website LAPIS usages should prefer `/query`.
