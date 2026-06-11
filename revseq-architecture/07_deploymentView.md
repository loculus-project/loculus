# 7. Deployment View

The ReVSeq instance is configured in `kubernetes/loculus/values_revseq.yaml`.
The public preview also needs the ReVSeq overlay in
`kubernetes/loculus/values_preview_server.yaml`, because the preview deployment
path applies the generic preview values file directly.

Important local endpoints:

- Website: `http://127.0.0.1:3000/`
- Backend: `http://127.0.0.1:8079/`
- LAPIS: `http://127.0.0.1:8080/`
- Keycloak: `http://127.0.0.1:8083/`

The preview values:

- Set the instance name to `ReVSeq`.
- Enable test accounts.
- Disable automated INSDC ingest.
- Disable ENA deposition, SeqSets, and Data Use Terms.
- Enable the `revseqSeed` job so the preview starts with ENA-derived consensus
  test data.
- Enable `sars-cov-2`, `rsv`, `influenza-a`, `influenza-b`, `hmpv`, `hpiv`,
  and `seasonal-coronavirus`.

`influenza-b` is configured for future data, but the current PRJEB83635 test
data has no matching influenza B consensus records.
