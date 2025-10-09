CREATE VIEW sequence_entries_staging AS
SELECT
    m.upload_id,
    m.accession,
    m.version,
    m.organism,
    m.submission_id,
    m.submitter,
    m.group_id,
    m.uploaded_at AS submitted_at,
    jsonb_build_object(
        'metadata', m.metadata,
        'files', m.files,
        'unalignedNucleotideSequences',
        COALESCE(
            jsonb_object_agg(
                s.segment_name,
                s.compressed_sequence_data::jsonb
            ) FILTER (WHERE s.segment_name IS NOT NULL),
            '{}'::jsonb
        )
    ) AS original_data
FROM
    metadata_upload_aux_table m
LEFT JOIN
    sequence_upload_aux_table s
    ON m.upload_id = s.upload_id
    AND m.submission_id = s.submission_id
GROUP BY
    m.upload_id,
    m.accession,
    m.version,
    m.organism,
    m.submission_id,
    m.submitter,
    m.group_id,
    m.uploaded_at,
    m.metadata,
    m.files;
