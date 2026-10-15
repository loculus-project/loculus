ALTER TABLE groups_table 
    ADD COLUMN created_at TIMESTAMP NULL,
    ADD COLUMN created_by TEXT NULL;

-- Try to populate created_at and created_by from the audit_log table.
-- The audit log only documented the name a group was updated to and not from.
-- Because group names are not unique, we can only identify creation time and user for a group if:
--	1) There is exactly ONE 'Created group: <group_name>' entries in the audit_log
--	2) There are NO 'Updated group: <group_name>' entries in the audit_log
UPDATE groups_table g
SET
    created_at = (
        SELECT al.timestamp
        FROM audit_log al
        WHERE al.description = 'Created group: ' || g.group_name
        ORDER BY al.timestamp ASC
        LIMIT 1
    ),
    created_by = (
        SELECT al.username
        FROM audit_log al
        WHERE al.description = 'Created group: ' || g.group_name
        ORDER BY al.timestamp ASC
        LIMIT 1
    )
WHERE g.created_at IS NULL
  AND (SELECT COUNT(*) FROM audit_log WHERE description = 'Created group: ' || g.group_name) = 1
  AND NOT EXISTS (
      SELECT 1
      FROM audit_log u
      WHERE u.description = 'Updated group: ' || g.group_name
  );

-- Fallback for groups where backfill from audit_log failed.
-- Limitations:
--	1) There are no timestamps in users_groups_table, meaning we fall back to the time this migration is executed
--	2) If the original creator has left the group but there is still another user left, this user
--	   will be listed as the group creator even though they are not.
--	3) If the original creator has left the group and there are no users left for the group,
--	   created_by will remain NULL but created_at will still be set to migration execution time.
UPDATE groups_table g SET
    created_at = timezone('UTC', CURRENT_TIMESTAMP),
    created_by = (
	SELECT ug.user_name 
	FROM user_groups_table ug
	WHERE ug.group_id = g.group_id
	ORDER BY ug.id ASC
	LIMIT 1
    )
WHERE g.created_at IS NULL;

ALTER TABLE groups_table
    ALTER COLUMN created_at SET NOT NULL;
