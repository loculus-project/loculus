UPDATE submission_table
SET status_all = 'SUBMITTED_ALL'
WHERE status_all = 'SENT_TO_LOCULUS';
