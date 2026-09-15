package org.loculus.backend.utils

import org.postgresql.util.PSQLException
import org.postgresql.util.PSQLState
import java.sql.SQLException

data class DuplicateRecordId(val field: String, val value: String)

// Record IDs can contain commas and parentheses.
private val duplicateRecordKey = Regex(
    """Key \(upload_id, (\w+)\)=\(([^,]+), (.+)\) already exists\.""",
    RegexOption.DOT_MATCHES_ALL,
)

/** Returns null if the duplicate ID cannot be read from the error. */
fun SQLException.extractDuplicateRecordId(uploadId: String): DuplicateRecordId? =
    generateSequence<Throwable>(this) { it.cause }
        .filterIsInstance<SQLException>()
        .flatMap { it.asSequence() }
        .filterIsInstance<PSQLException>()
        .filter { it.sqlState == PSQLState.UNIQUE_VIOLATION.state }
        .firstNotNullOfOrNull { exception ->
            val detail: String = exception.serverErrorMessage?.detail ?: return@firstNotNullOfOrNull null
            val match = duplicateRecordKey.matchEntire(detail) ?: return@firstNotNullOfOrNull null
            val (column, errorUploadId, id) = match.destructured
            val field = when (column) {
                "submission_id" -> "submissionId"
                "fasta_id" -> "FASTA ID"
                "accession" -> "accession"
                else -> return@firstNotNullOfOrNull null
            }
            if (errorUploadId == uploadId) DuplicateRecordId(field, id) else null
        }
