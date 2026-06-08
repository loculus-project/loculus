# Gaps

Remaining website uses of `/{organism}/lapis/**`:

- `website/src/components/SearchPage/fields/AutoCompleteOptions.ts`: lineage definition lookup still uses the raw LAPIS proxy.
- `website/src/components/DataUseTerms/EditDataUseTermsModal.tsx`: data-use-terms details still call `useDetails()` without a `/query` URL.
- `website/src/pages/loculus-info/index.ts`: runtime info still exposes per-organism raw LAPIS URLs.
- `website/src/services/lapisClient.ts`: `streamSequences()` and `getDetails()` still target raw LAPIS, though they currently have no production website callers.

