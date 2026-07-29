package org.loculus.backend.metrics

// Tag values for the submission metrics. Kept together so the set of operations and phases stays reviewable.

const val SUBMIT_ENDPOINT = "submit"
const val REVISE_ENDPOINT = "revise"
const val SUBMIT_PROCESSED_DATA_ENDPOINT = "submit-processed-data"
const val EXTRACT_UNPROCESSED_DATA_ENDPOINT = "extract-unprocessed-data"
const val GET_RELEASED_DATA_ENDPOINT = "get-released-data"
const val GET_SUBMITTED_METADATA_ENDPOINT = "get-submitted-metadata"
const val GET_SUBMITTED_DATA_ENDPOINT = "get-submitted-data"

const val VALIDATE_UPLOAD_PHASE = "validate-upload"
const val COPY_TO_AUX_TABLE_PHASE = "copy-to-aux-table"
const val LOAD_METADATA_SUBMISSION_IDS_PHASE = "load-metadata-submission-ids"
const val VALIDATE_CONSENSUS_SEQUENCES_PHASE = "validate-consensus-sequences"
const val ASSOCIATE_REVISED_DATA_PHASE = "associate-revised-data"
const val VALIDATE_FILE_MAPPING_PHASE = "validate-file-mapping"
const val GENERATE_ACCESSIONS_PHASE = "generate-accessions"
const val INSERT_SEQUENCE_ENTRIES_PHASE = "insert-sequence-entries"
const val CLEANUP_UPLOAD_DATA_PHASE = "cleanup-upload-data"
const val STORE_PREPROCESSED_DATA_PHASE = "store-preprocessed-data"
const val STREAM_UNPROCESSED_DATA_PHASE = "stream-unprocessed-data"
const val STREAM_RELEASE_FILE_PHASE = "stream-release-file"
const val STREAM_SUBMITTED_METADATA_PHASE = "stream-submitted-metadata"
const val STREAM_SUBMITTED_DATA_PHASE = "stream-submitted-data"
const val STREAM_RESPONSE_PHASE = "stream-response"

// Endpoints that pipelines poll in a loop, where request rate and duration are worth tracking separately.
val POLLING_ENDPOINTS = setOf(EXTRACT_UNPROCESSED_DATA_ENDPOINT, GET_RELEASED_DATA_ENDPOINT)

fun readPhaseForEndpoint(endpoint: String) = when (endpoint) {
    EXTRACT_UNPROCESSED_DATA_ENDPOINT -> STREAM_UNPROCESSED_DATA_PHASE
    GET_RELEASED_DATA_ENDPOINT -> STREAM_RELEASE_FILE_PHASE
    GET_SUBMITTED_METADATA_ENDPOINT -> STREAM_SUBMITTED_METADATA_PHASE
    else -> STREAM_RESPONSE_PHASE
}
