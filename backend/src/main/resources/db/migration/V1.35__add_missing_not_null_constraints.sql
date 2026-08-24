-- These columns were always required by the application but the database never enforced it.
ALTER TABLE groups_table
    ALTER COLUMN group_name SET NOT NULL,
    ALTER COLUMN address_line_2 SET NOT NULL,
    ALTER COLUMN address_state SET NOT NULL;

ALTER TABLE seqsets
    ALTER COLUMN description SET NOT NULL;

-- last_time_updated is only ever written by the update_table_tracker() trigger (see V1.2), which always
-- supplies a value.
ALTER TABLE table_update_tracker
    ALTER COLUMN last_time_updated SET NOT NULL;
