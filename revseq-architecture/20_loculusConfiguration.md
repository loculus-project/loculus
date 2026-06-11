# 20. Loculus Configuration

The reusable ReVSeq values are in `kubernetes/loculus/values_revseq.yaml`.
The public preview uses `kubernetes/loculus/values_preview_server.yaml`, which
contains the generic preview-server secrets/resources plus the same ReVSeq
instance overlay.

Global settings:

- `name: ReVSeq`
- `seqSets.enabled: false`
- `dataUseTerms.enabled: false`
- `createTestAccounts: true`
- `disableEnaSubmission: true`
- `disableIngest: true`
- `fileSharing.outputFileUrlType: backend`
- `revseqSeed.enabled: true`

Enabled organisms:

- `sars-cov-2`
- `rsv`
- `influenza-a`
- `influenza-b`
- `hmpv`
- `hpiv`
- `seasonal-coronavirus`

All organisms accept consensus FASTA submissions. File uploads are disabled in
the current preview. All organisms use
`ghcr.io/loculus-project/preprocessing-nextclade`.

Automated INSDC ingest is disabled; preview data is submitted through the
normal Loculus submission API by the `revseqSeed` job.

RSV uses `referenceIdentifierField: genotype` and has references `RSV-A` and
`RSV-B`.

Influenza A is an eight-segment organism. It uses per-segment assigned
references `H1N1` and `H3N2` and a sample-level `subtype` field.

Influenza B is an eight-segment organism using the official single-reference
Nextclade segment datasets.

HPIV uses `referenceIdentifierField: hpivType` and has references `HPIV-1`,
`HPIV-2`, `HPIV-3`, and `HPIV-4a`.

Seasonal coronavirus uses `referenceIdentifierField: seasonalCoronavirusType`
and has references `229E`, `HKU1`, `NL63`, and `OC43`.
