# 11. Risks and Technical Debt

1. There is no admin UI for creating or editing views yet.
2. Schema and SQL output can drift because schema inference is not implemented.
3. Each view downloads all configured source organisms, which may become expensive.
4. DuckDB SQL is powerful enough to create slow or invalid queries.
5. View materialization currently works at whole-view granularity, not incremental row updates.
6. Sequence-enabled views can confuse admins if segment names are not documented in the config.
7. Views do not support aligned sequences, mutations, insertions, or amino acid data.
8. The `overview` name still exists as a legacy compatibility concept.
