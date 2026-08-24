-- These columns were always required by the application but the database never enforced it.
ALTER TABLE groups_table
    ALTER COLUMN group_name SET NOT NULL,
    ALTER COLUMN address_line_2 SET NOT NULL,
    ALTER COLUMN address_state SET NOT NULL;

ALTER TABLE seqsets
    ALTER COLUMN description SET NOT NULL;

ALTER TABLE sequence_entries
    ALTER COLUMN approver SET NOT NULL;
