package org.loculus.backend.api

import io.swagger.v3.oas.annotations.media.Schema
import org.loculus.backend.utils.Accession
import java.sql.Timestamp
import java.util.UUID

data class SubmittedSeqSetRecord(
    val accession: Accession,
    @Schema(
        description = "The type of the accession.",
        type = "string",
        example = "GenBank",
    )
    val type: String,
)

data class SubmittedSeqSet(
    val name: String,
    val description: String?,
    val records: List<SubmittedSeqSetRecord>,
)

data class SubmittedSeqSetUpdate(
    val seqSetId: String,
    val name: String,
    val description: String,
    val records: List<SubmittedSeqSetRecord>,
)

data class SeqSetRecord(
    val seqSetRecordId: Long,
    val accession: Accession,
    val type: String,
)

data class SeqSet(
    val seqSetId: UUID,
    val seqSetVersion: Long,
    val name: String,
    val createdAt: Timestamp,
    val createdBy: String,
    val description: String?,
    @Schema(
        description = "The DOI of the seqSet.",
        type = "string",
        example = "10.1234/5678",
    )
    val seqSetDOI: String?,
)

data class ResponseSeqSet(
    val seqSetId: String,
    val seqSetVersion: Long,
)

data class CitedBy(
    @Schema(
        description = "The years in which the seqSet or sequence was cited.",
        type = "array",
        example = "[2000, 2001, 2002]",
    )
    val years: MutableList<Long>,
    @Schema(
        description = "The number of citations per year.",
        type = "array",
        example = "[1, 2, 3]",
    )
    val citations: MutableList<Long>,
)

data class AuthorProfile(
    val username: String,
    val firstName: String,
    val lastName: String,
    val emailDomain: String,
    @Schema(
        description = "The university the author is affiliated with.",
        type = "string",
        example = "University of Example",
    )
    val university: String?,
)

object SeqSetCitationsConstants {
    const val DOI_PREFIX = "placeholder"
    const val DOI_WEEKLY_RATE_LIMIT = 7
}
