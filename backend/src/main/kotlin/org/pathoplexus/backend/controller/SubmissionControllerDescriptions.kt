package org.pathoplexus.backend.controller

const val SUBMIT_RESPONSE_DESCRIPTION = """
Returns a list of sequenceId, version and customId of the submitted sequences. 
The customId is the (locally unique) id provided by the submitter as 'header' in the metadata file. 
The version will be 1 for every sequence. 
The sequenceId is the (globally unique) id that the system assigned to the sequence. 
You can use this response to associate the user provided customId with the system assigned sequenceId.
"""

const val METADATA_FILE_DESCRIPTION = """    
A TSV (tab separated values) file containing the metadata of the submitted sequences.
It must contain the column names.
The field 'header' is required and must be unique within the provided dataset.
It is used to associate metadata to the sequences in the sequences fasta file.
"""
const val SEQUENCE_FILE_DESCRIPTION = """
A fasta file containing the unaligned nucleotide sequences of the submitted sequences.
The header of each sequence must match the 'header' field in the metadata file.
"""
const val EXTRACT_UNPROCESSED_DATA_DESCRIPTION = """
Extract unprocessed sequences. This is supposed to be used as input for the preprocessing pipeline.
Returns a stream of NDJSON and sets the status each sequence to 'PROCESSING'.
"""
const val EXTRACT_UNPROCESSED_DATA_RESPONSE_DESCRIPTION = """
Sequence data as input for the preprocessing pipeline.
The schema is to be understood per line of the NDJSON stream.
"""

const val SUBMIT_REVIEWED_SEQUENCE_DESCRIPTION = """
Submit a review for a sequence that corrects errors found by the preprocessing pipeline 
or the user themselves. This will set the status of the sequence to
'REVIEWED' and it will be processed by the next pipeline run.
"""
const val MAX_EXTRACTED_SEQUENCES = 100_000L

const val SUBMIT_PROCESSED_DATA_DESCRIPTION = """
Submit processed data as a stream of NDJSON. The schema is to be understood per line of the NDJSON stream. 
This endpoint performs validation (type validation, missing/required fields, comparison to reference genome) on the data
returned by the processing pipeline, so that it can technically be used for release. On a technical error, this endpoint
 will roll back all previously inserted data. It is the responsibility of the processing pipeline to ensure that the 
 content of the data is correct. If the pipeline is unable to provide valid data, it should submit the data with errors.
 In this case, no validation will be performed and the status of the sequence version will be set to 'NEEDS_REVIEW'.
 The user can then review the data and submit a corrected version.
"""

const val SUBMIT_PROCESSED_DATA_ERROR_RESPONSE_DESCRIPTION = """
On sequence version that cannot be written to the database, e.g. if the sequence id does not exist or processing
 pipeline submits invalid data. Rolls back the whole transaction.
"""

const val GET_DATA_TO_REVIEW_DESCRIPTION = """
Get processed sequence data with errors to review as a stream of NDJSON.
This returns all sequences of the user that have the status 'REVIEW_NEEDED'.
"""

const val GET_DATA_TO_REVIEW_SEQUENCE_VERSION_DESCRIPTION = """
Get processed sequence data with errors to review for a single sequence version.
The sequence version must be in status 'REVIEW_NEEDED' or 'PROCESSED'.
"""

const val GET_SEQUENCES_OF_USER_DESCRIPTION = """
Get a list of submitted sequence versions and their status for the given user.
This returns the last sequence version in status SILO_READY and
the sequence version that is not 'SILO_READY' (if it exists).
"""

const val APPROVE_PROCESSED_DATA_DESCRIPTION = """
Approve processed sequence versions and set the status to 'SILO_READY'.
This can only be done for sequences in status 'PROCESSED' that the user submitted themselves.
"""

const val REVOKE_DESCRIPTION = """
Revoke existing sequence. 
Creates a new revocation version and stages it for confirmation. 
If successfully, this returns the sequenceIds, versions and status of the revocation versions.
If any of the given sequences do not exist, or do not have the latest version in status 'SILO_READY', 
or the given user has no right to the sequence, this will return an error and roll back the whole transaction.
"""

const val CONFIRM_REVOCATION_DESCRIPTION = """
Confirm revocation of existing sequences. 
This will set the status 'REVOKED_STAGING' of the revocation version to 
'SILO_READY'. If any of the given sequence versions do not exist, or do not have the latest version in status 
'REVOKED_STAGING', or the given user has no right to the sequence, this will return an error and roll back the whole 
transaction.
"""

const val REVISE_RESPONSE_DESCRIPTION = """
Returns a list of sequenceId, version and customId of the submitted revised sequences.
The version will increase by one in respect to the original sequence.
"""

const val REVISED_METADATA_FILE_DESCRIPTION = """
A TSV (tab separated values) file containing the metadata of the revised sequences.
The first row must contain the column names. The column 'header' is required and must be unique within the provided
 dataset. It is used to associate metadata to the sequences in the sequences fasta file.
Additionally, the column 'sequenceId' is required and must match the sequenceId of the original sequence.
"""

const val REVISE_DESCRIPTION = """
Submit revised data for new sequences as multipart/form-data.
If any of the given sequences do not exist (identified by the column 'sequenceId' in the metadata file),
 or the user has no right to revise any of the sequences, or the last sequence version is not in status 'SILO_READY',
 i.e. not revisable, or if the provided files contain unspecified content, this will return an error and roll back the 
 whole transaction.
"""

const val DELETE_SEQUENCES_DESCRIPTION = """
Delete existing sequence versions. 
If any of the given sequences do not exist, or the user has no right to delete any of the sequences or a 
sequence version is in status 'SILO_READY' or 'PROCESSING', i.e. not deletable, this will return an error 
and roll back the whole transaction.
"""

const val GET_RELEASED_DATA_DESCRIPTION = """
Get released data as a stream of NDJSON.
This returns all sequences versions that have the status 'SILO_READY' 
"""

const val GET_RELEASED_DATA_RESPONSE_DESCRIPTION = """
Sequence data as input for the preprocessing pipeline.
The schema is to be understood per line of the NDJSON stream.    
"""
