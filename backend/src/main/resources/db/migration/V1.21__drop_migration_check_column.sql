-- Ensure no NULLs exist before dropping the columns
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM sequence_entries_preprocessed_data
        WHERE compression_migration_checked_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot drop column compression_migration_checked_at: NULL values exist in sequence_entries_preprocessed_data - this means not all rows have been migrated.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM sequence_entries
        WHERE compression_migration_checked_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot drop column compression_migration_checked_at: NULL values exist in sequence_entries - this means not all rows have been migrated.';
    END IF;
END $$;

ALTER TABLE sequence_entries_preprocessed_data
    DROP COLUMN compression_migration_checked_at;

ALTER TABLE sequence_entries
    DROP COLUMN compression_migration_checked_at;
