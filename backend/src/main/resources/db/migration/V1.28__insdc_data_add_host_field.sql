-- Collapse INSDC host organism fields into a single `host` key in `unprocessed_data`,
-- so ingested sequences follow the same submission path as direct submissions.
-- For each row with one of the legacy keys (and no `host` yet), drop
-- `hostTaxonId`, `hostNameScientific`, and `hostNameCommon` and set `host` to the taxon id,
-- falling back to the scientific name if no taxon id is present.
--
-- Only `unprocessed_data` is rewritten; `original_data` is left alone.
-- Because the collapse to `host` happens after hashing in `prepare_metadata.py,`
-- this should not trigger revisions for existing data.

UPDATE sequence_entries
SET unprocessed_data = jsonb_set(
    unprocessed_data,
    '{metadata}',
    ((unprocessed_data -> 'metadata') - 'hostTaxonId' - 'hostNameScientific' - 'hostNameCommon')
    || CASE
         WHEN COALESCE(
                NULLIF(unprocessed_data -> 'metadata' ->> 'hostTaxonId', ''),
                NULLIF(unprocessed_data -> 'metadata' ->> 'hostNameScientific', '')
              ) IS NOT NULL
         THEN jsonb_build_object('host', COALESCE(
                NULLIF(unprocessed_data -> 'metadata' ->> 'hostTaxonId', ''),
                NULLIF(unprocessed_data -> 'metadata' ->> 'hostNameScientific', '')))
         ELSE '{}'::jsonb
       END
)
WHERE unprocessed_data IS NOT NULL
  AND (unprocessed_data -> 'metadata' ? 'hostTaxonId'
       OR unprocessed_data -> 'metadata' ? 'hostNameScientific'
       OR unprocessed_data -> 'metadata' ? 'hostNameCommon')
  AND NOT (unprocessed_data -> 'metadata' ? 'host');
