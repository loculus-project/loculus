-- These columns have always been mapped as text() on the Exposed side (GroupsTable); the database's
-- varchar(255) cap was never enforced by the application and predates the schema-consistency check
-- (ExposedSchemaConsistencyCheck.kt), which could not previously detect this direction of type mismatch.
ALTER TABLE groups_table
    ALTER COLUMN group_name TYPE TEXT,
    ALTER COLUMN institution TYPE TEXT,
    ALTER COLUMN address_line_1 TYPE TEXT,
    ALTER COLUMN address_line_2 TYPE TEXT,
    ALTER COLUMN address_postal_code TYPE TEXT,
    ALTER COLUMN address_city TYPE TEXT,
    ALTER COLUMN address_state TYPE TEXT,
    ALTER COLUMN address_country TYPE TEXT,
    ALTER COLUMN contact_email TYPE TEXT;
