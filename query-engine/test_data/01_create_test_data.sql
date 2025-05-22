-- Test data for query engine development
-- This creates minimal test data for the query engine

-- Create test groups
INSERT INTO groups_table (group_id, group_name, institution, address_line_1, address_postal_code, address_city, address_country, contact_email)
VALUES 
(1, 'Test Group 1', 'Test Institution', '123 Test St', '12345', 'Test City', 'Test Country', 'test@example.com'),
(2, 'Test Group 2', 'Another Institution', '456 Another St', '67890', 'Another City', 'Another Country', 'another@example.com')
ON CONFLICT (group_id) DO NOTHING;

-- Create current processing pipeline
INSERT INTO current_processing_pipeline (version, started_using_at, organism)
VALUES 
(1, NOW(), 'testorganism'),
(1, NOW(), 'anotherorganism')
ON CONFLICT (organism) DO UPDATE SET version = EXCLUDED.version;

-- Create test sequence entries
INSERT INTO sequence_entries (accession, version, organism, submission_id, submitter, approver, group_id, submitted_at, released_at, is_revocation, original_data, version_comment)
VALUES 
('TEST001', 1, 'testorganism', 'sub001', 'testuser1', 'approver1', 1, NOW() - INTERVAL '10 days', NOW() - INTERVAL '5 days', false, 
 '{"metadata": {"country": "USA", "date": "2023-01-15", "host": "human"}}', 'Initial submission'),
('TEST002', 1, 'testorganism', 'sub002', 'testuser2', 'approver1', 1, NOW() - INTERVAL '8 days', NOW() - INTERVAL '3 days', false,
 '{"metadata": {"country": "Canada", "date": "2023-01-20", "host": "human"}}', 'Initial submission'),
('TEST003', 1, 'testorganism', 'sub003', 'testuser1', NULL, 2, NOW() - INTERVAL '6 days', NULL, false,
 '{"metadata": {"country": "UK", "date": "2023-01-25", "host": "human"}}', 'Pending approval'),
('TEST001', 2, 'testorganism', 'sub004', 'testuser1', 'approver1', 1, NOW() - INTERVAL '4 days', NOW() - INTERVAL '2 days', false,
 '{"metadata": {"country": "USA", "date": "2023-01-15", "host": "human", "updated": "true"}}', 'Revised submission'),
('ANOTHER001', 1, 'anotherorganism', 'sub005', 'testuser3', 'approver2', 2, NOW() - INTERVAL '7 days', NOW() - INTERVAL '4 days', false,
 '{"metadata": {"region": "Europe", "sample_date": "2023-02-01", "lineage": "A.1"}}', 'Initial submission')
ON CONFLICT (accession, version) DO NOTHING;

-- Create preprocessed data
INSERT INTO sequence_entries_preprocessed_data (accession, version, pipeline_version, processed_data, errors, warnings, processing_status, started_processing_at, finished_processing_at)
VALUES 
('TEST001', 1, 1, 
 '{"unalignedNucleotideSequences": {"main": "ATCGATCGATCGATCG"}, "metadata": {"country": "USA", "date": "2023-01-15", "host": "human", "qc_score": 0.95}}',
 '[]', '[]', 'PROCESSED', NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days'),
('TEST002', 1, 1,
 '{"unalignedNucleotideSequences": {"main": "GCTAGCTAGCTAGCTA"}, "metadata": {"country": "Canada", "date": "2023-01-20", "host": "human", "qc_score": 0.92}}',
 '[]', '["Low quality region detected"]', 'PROCESSED', NOW() - INTERVAL '8 days', NOW() - INTERVAL '7 days'),
('TEST003', 1, 1,
 '{"unalignedNucleotideSequences": {"main": "TTAAGGCCTTAAGGCC"}, "metadata": {"country": "UK", "date": "2023-01-25", "host": "human", "qc_score": 0.88}}',
 '[]', '[]', 'PROCESSED', NOW() - INTERVAL '6 days', NOW() - INTERVAL '5 days'),
('TEST001', 2, 1,
 '{"unalignedNucleotideSequences": {"main": "ATCGATCGATCGATCGAAAA"}, "metadata": {"country": "USA", "date": "2023-01-15", "host": "human", "updated": "true", "qc_score": 0.97}}',
 '[]', '[]', 'PROCESSED', NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days'),
('ANOTHER001', 1, 1,
 '{"unalignedNucleotideSequences": {"main": "AAAATTTTCCCCGGGG"}, "metadata": {"region": "Europe", "sample_date": "2023-02-01", "lineage": "A.1", "qc_score": 0.93}}',
 '[]', '[]', 'PROCESSED', NOW() - INTERVAL '7 days', NOW() - INTERVAL '6 days')
ON CONFLICT (accession, version, pipeline_version) DO NOTHING;