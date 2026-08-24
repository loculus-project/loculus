-- These columns were always required by the application but the database never enforced it.
-- Backfill any legacy NULLs first so the constraint can never fail mid-deploy.
UPDATE groups_table SET group_name = '' WHERE group_name IS NULL;
UPDATE groups_table SET address_line_2 = '' WHERE address_line_2 IS NULL;
UPDATE groups_table SET address_state = '' WHERE address_state IS NULL;

ALTER TABLE groups_table
    ALTER COLUMN group_name SET NOT NULL,
    ALTER COLUMN address_line_2 SET NOT NULL,
    ALTER COLUMN address_state SET NOT NULL;

UPDATE seqsets SET description = '' WHERE description IS NULL;

ALTER TABLE seqsets
    ALTER COLUMN description SET NOT NULL;

-- last_time_updated is only ever written by the update_table_tracker() trigger (see V1.2), which always
-- supplies a value.
ALTER TABLE table_update_tracker
    ALTER COLUMN last_time_updated SET NOT NULL;
