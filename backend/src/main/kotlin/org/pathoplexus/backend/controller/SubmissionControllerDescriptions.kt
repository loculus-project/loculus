package org.pathoplexus.backend.controller

const val SUBMIT_RESPONSE_DESCRIPTION = """
Returns a list of accession, version and submissionId of the submitted sequence entries. 
The submissionId is the (locally unique) id provided by the submitter as 'submissionId' in the metadata file. 
The version will be 1 for every sequence. 
The accession is the (globally unique) id that the system assigned to the sequence entry. 
You can use this response to associate the user provided submissionId with the system assigned accession.
"""

const val METADATA_FILE_DESCRIPTION = """    
A TSV (tab separated values) file containing the metadata of the submitted sequence entries. 
The file may be compressed with zstd, xz, zip, gzip, lzma, bzip2 (with common extensions).
It must contain the column names.
The field 'submissionId' is required and must be unique within the provided dataset.
It is used to associate metadata to the sequences in the sequences fasta file.
"""
const val SEQUENCE_FILE_DESCRIPTION = """
A fasta file containing the unaligned nucleotide sequences of the submitted sequences.
The file may be compressed with zstd, xz, zip, gzip, lzma, bzip2 (with common extensions).
If the underlying organism has a single segment,
the headers of the fasta file must match the 'submissionId' field in the metadata file.
If the underlying organism has multiple segments,
the headers of the fasta file must be of the form '>[submissionId]_[segmentName]'.
"""
const val EXTRACT_UNPROCESSED_DATA_DESCRIPTION = """
Extract unprocessed accession versions. This is supposed to be used as input for the preprocessing pipeline.
Returns a stream of NDJSON and sets the status of each accession version to 'IN_PROCESSING'.
"""
const val EXTRACT_UNPROCESSED_DATA_RESPONSE_DESCRIPTION = """
Sequence data as input for the preprocessing pipeline.
The schema is to be understood per line of the NDJSON stream.
"""

const val SUBMIT_EDITED_DATA_DESCRIPTION = """
Submit edited data for an accession version that corrects errors found by the preprocessing pipeline 
or the user themselves. This will set the status of the accession version to
'RECEIVED' and it will be processed by the next pipeline run.
"""
const val MAX_EXTRACTED_SEQUENCE_ENTRIES = 100_000L

const val SUBMIT_PROCESSED_DATA_DESCRIPTION = """
Submit processed data as a stream of NDJSON. The schema is to be understood per line of the NDJSON stream. 
This endpoint performs validation (type validation, missing/required fields, comparison to reference genome) on the data
returned by the processing pipeline, so that it can technically be used for release. On a technical error, this endpoint
 will roll back all previously inserted data. It is the responsibility of the processing pipeline to ensure that the 
 content of the data is correct. If the pipeline is unable to provide valid data, it should submit the data with errors.
 In this case, no validation will be performed and the status of the accession version will be set to 'HAS_ERRORS'.
 The user can then edit the data and submit a corrected version.
"""

const val SUBMIT_PROCESSED_DATA_ERROR_RESPONSE_DESCRIPTION = """
On accession version that cannot be written to the database, e.g. if the accession does not exist or processing
 pipeline submits invalid data. Rolls back the whole transaction.
"""

const val GET_DATA_TO_EDIT_DESCRIPTION = """
Get processed sequence data with errors to edit as a stream of NDJSON.
This returns all sequence entries of the user that have the status 'HAS_ERRORS'.
"""

const val GET_DATA_TO_EDIT_SEQUENCE_VERSION_DESCRIPTION = """
Get processed sequence data with errors to edit for a single accession version.
The accession version must be in status 'HAS_ERRORS' or 'AWAITING_APPROVAL'.
"""

const val GET_SEQUENCES_OF_USER_DESCRIPTION = """
Get a list of submitted accession versions and their status for the given user.
This returns the last accession version in status APPROVED_FOR_RELEASE and
the accession version that is not 'APPROVED_FOR_RELEASE' (if it exists).
"""

const val APPROVE_PROCESSED_DATA_DESCRIPTION = """
Approve processed accession versions and set the status to 'APPROVED_FOR_RELEASE'.
This can only be done for accession versions in status 'AWAITING_APPROVAL' that the user submitted themselves.
"""

const val REVOKE_DESCRIPTION = """
Revoke existing sequence entry. 
Creates a new revocation version and stages it for confirmation. 
If successfully, this returns the accessions, versions and status of the revocation versions.
If any of the given sequence entries do not exist, or do not have the latest version in status 'APPROVED_FOR_RELEASE', 
or the given user has no right to the sequence entry, this will return an error and roll back the whole transaction.
"""

const val CONFIRM_REVOCATION_DESCRIPTION = """
Confirm revocation of existing sequence entries. 
This will set the status 'AWAITING_APPROVAL_FOR_REVOCATION' of the revocation version to 
'APPROVED_FOR_RELEASE'. If any of the given accession versions do not exist, or do not have the latest version in status 
'AWAITING_APPROVAL_FOR_REVOCATION', or the given user has no right to the sequence entry, this will return an error and roll back the 
whole transaction.
"""

const val REVISE_RESPONSE_DESCRIPTION = """
Returns a list of accessions, versions and submissionIds of the submitted revised data.
The version will increase by one in respect to the original accession version.
"""

const val REVISED_METADATA_FILE_DESCRIPTION = """
A TSV (tab separated values) file containing the metadata of the revised data.
The first row must contain the column names. The column 'submissionId' is required and must be unique within the 
provided dataset. It is used to associate metadata to the sequences in the sequences fasta file.
Additionally, the column 'accession' is required and must match the accession of the original sequence entry.
"""

const val REVISE_DESCRIPTION = """
Submit revised data for new accession versions as multipart/form-data.
If any of the given sequence entries do not exist (identified by the column 'accession' in the metadata file),
 or the user has no right to revise any of the sequence entries, or the last accession version is not in status 
 'APPROVED_FOR_RELEASE',  i.e. not revisable, or if the provided files contain unspecified content, this will return an error and 
 roll back the whole transaction.
"""

const val DELETE_SEQUENCES_DESCRIPTION = """
Delete existing accession versions. 
If any of the given accession versions do not exist, or the user has no right to delete any of the accession versions 
or an accession version is in status 'APPROVED_FOR_RELEASE' or 'IN_PROCESSING', i.e. not deletable, this will return an error 
and roll back the whole transaction.
"""

const val GET_RELEASED_DATA_DESCRIPTION = """
Get released data as a stream of NDJSON.
This returns all accession versions that have the status 'APPROVED_FOR_RELEASE' 
"""

const val GET_RELEASED_DATA_RESPONSE_DESCRIPTION = """
Releasable accession versions.
The schema is to be understood per line of the NDJSON stream.    
"""
