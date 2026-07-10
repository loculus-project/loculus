CREATE TABLE sent_notifications (
    notification_type VARCHAR(64) NOT NULL,
    accession TEXT NOT NULL,
    version BIGINT NOT NULL,
    group_id INTEGER NOT NULL,
    recipient_username TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    cc_email TEXT NOT NULL,
    message_id TEXT NOT NULL,
    sent_at TIMESTAMP NOT NULL,
    PRIMARY KEY (notification_type, accession, version),
    FOREIGN KEY (accession, version)
        REFERENCES sequence_entries (accession, version)
        ON DELETE CASCADE
);

CREATE INDEX sent_notifications_message_id_idx ON sent_notifications (message_id);

-- Do not send release confirmations for sequences released before this feature was deployed.
INSERT INTO sent_notifications (
    notification_type,
    accession,
    version,
    group_id,
    recipient_username,
    recipient_email,
    cc_email,
    message_id,
    sent_at
)
SELECT
    'RELEASE_CONFIRMATION',
    accession,
    version,
    group_id,
    COALESCE(approver, '<unknown>'),
    '',
    '',
    'migration-existing-releases',
    timezone('UTC', CURRENT_TIMESTAMP)
FROM sequence_entries
WHERE released_at IS NOT NULL;
