# 11. Risks and Technical Debt

1. The legacy `/{organism}/lapis/**` proxy still exists and should be retired after remaining callers move.
2. The backend currently injects only version-scope filters; future access-control filters need careful composition with user queries.
3. Query endpoint coverage follows current Loculus usage, so new LAPIS endpoints need explicit backend route additions.
4. The split OpenAPI endpoints filter paths after generation; future customizers must keep concrete query paths stable.
5. Scalar is loaded from a CDN in the current backend HTML shell.

