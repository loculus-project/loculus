CREATE TABLE pending_release_notifications (
    accession TEXT NOT NULL,
    version BIGINT NOT NULL,
    enqueued_at TIMESTAMP NOT NULL DEFAULT timezone('UTC', CURRENT_TIMESTAMP),
    PRIMARY KEY (accession, version),
    FOREIGN KEY (accession, version)
        REFERENCES sequence_entries (accession, version)
        ON DELETE CASCADE
);

CREATE INDEX pending_release_notifications_enqueued_at_idx
    ON pending_release_notifications (enqueued_at);
