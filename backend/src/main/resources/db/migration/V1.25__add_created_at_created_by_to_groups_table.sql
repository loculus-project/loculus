ALTER TABLE groups_table 
    ADD COLUMN created_at TIMESTAMP NULL,
    ADD COLUMN created_by TEXT NULL;

-- Try to populate created_at and created_by from the audit_log table.
-- Because group names are not unique, we can only condfidently identify creation time and user for a group if:
--	1) There is exactly ONE 'Created group: <group_name>' entries in the audit_log
--	    -> if there is more than one group with the same name, we can't tell which was created first
--	2) There are NO 'Updated group: <group_name>' entries in the audit_log
--	    -> this message is ambiguous: it can mean either that 'Group A was edited, but it's name has not changed' OR 
--	       'Group B was edited, it's name is now Group A'. This means that the group_name is essentially tainted and 
--	       can not be used to infer creation time and user anymore.
UPDATE groups_table g
SET
    created_at = (
        SELECT al.timestamp
        FROM audit_log al
        WHERE al.description = 'Created group: ' || g.group_name
        GROUP BY al.timestamp, al.username
        HAVING COUNT(*) = 1
    ),
    created_by = (
        SELECT al.username
        FROM audit_log al
        WHERE al.description = 'Created group: ' || g.group_name
        GROUP BY al.timestamp, al.username
        HAVING COUNT(*) = 1
    )
WHERE g.created_at IS NULL
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
