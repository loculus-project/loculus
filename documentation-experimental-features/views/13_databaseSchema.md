# 13. Database Schema

No new dedicated view tables are introduced.

Views are stored inside the DB-backed instance config document:

```yaml
views:
  overview:
    displayName: Overview
    query: "..."
    schema: "..."
    tableColumns: [...]
    lapisUrl: "..."
```

The same config versioning, publication, and fixture-loading mechanics described in `../configuration-management/13_databaseSchema.md` apply to views because they are part of instance config.

