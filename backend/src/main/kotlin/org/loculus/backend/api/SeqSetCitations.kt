package org.loculus.backend.api

import io.swagger.v3.oas.annotations.media.Schema
import org.loculus.backend.utils.Accession
import java.sql.Timestamp
import java.util.*

data class SubmittedSeqSetRecord(
    @Schema(
        description = "The accession of the sequence. Optionally includes a version suffix (e.g., LOC_123456.1).",
        type = "string",
        example = "PP_123456",
    )
    val accession: Accession,
    @Schema(
        description = "The type of accession (e.g., Loculus, INSDC, RefSeq).",
        type = "string",
        example = "Loculus",
    )
    val type: String,
    @Schema(
        description = "Whether the record is focal or part of a background set.",
        type = "boolean",
        example = "true",
    )
    val isFocal: Boolean = true,
)

data class SubmittedSeqSet(val name: String, val description: String?, val records: List<SubmittedSeqSetRecord>)

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
    val isFocal: Boolean = true,
)

data class SeqSet(
    val seqSetId: String,
    val seqSetVersion: Long,
    val name: String,
    val createdAt: Timestamp,
    val createdBy: String,
    val description: String?,
    @Schema(
        description = "The DOI of the SeqSet.",
        type = "string",
        example = "10.1234/5678",
    )
    val seqSetDOI: String?,
)

data class ResponseSeqSet(val seqSetId: String, val seqSetVersion: Long)

data class CitedBy(
    @Schema(
        description = "The years in which the SeqSet or sequence was cited.",
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
    const val DOI_WEEKLY_RATE_LIMIT = 7
}
