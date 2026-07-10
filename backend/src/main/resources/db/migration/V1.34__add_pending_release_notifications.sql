CREATE TABLE pending_release_notifications (
    accession TEXT NOT NULL,
    version BIGINT NOT NULL,
    organism TEXT NOT NULL,
    approver TEXT NOT NULL,
    group_id INTEGER NOT NULL,
    enqueued_at TIMESTAMP NOT NULL DEFAULT timezone('UTC', CURRENT_TIMESTAMP),
    PRIMARY KEY (accession, version),
    FOREIGN KEY (accession, version)
        REFERENCES sequence_entries (accession, version)
        ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups_table (group_id)
);

CREATE INDEX pending_release_notifications_grouped_idx
    ON pending_release_notifications (approver, group_id, enqueued_at, organism, accession, version);

CREATE INDEX pending_release_notifications_group_id_idx
    ON pending_release_notifications (group_id);
