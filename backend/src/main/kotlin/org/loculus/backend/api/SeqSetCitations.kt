package org.loculus.backend.api

import io.swagger.v3.oas.annotations.media.Schema
import org.loculus.backend.utils.Accession
import java.sql.Timestamp

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

@Schema(description = "Contributor to a citation source.")
data class CitationContributor(
    @Schema(example = "Jane")
    val givenName: String,
    @Schema(example = "Doe")
    val surname: String,
)

enum class CitationOrigin {
    CROSSREF,
    CURATED,
}

@Schema(description = "A publication or other content which cites one or more SeqSets.")
data class CitationSource(
    @Schema(
        description = "The DOI of the citation source.",
        example = "10.1234/5678",
    )
    val sourceDOI: String,
    @Schema(
        description = "The title of the citation source.",
        example = "Publication that references a SeqSet",
    )
    val title: String,
    @Schema(
        description = "The year the citation source was released.",
        example = "2026",
    )
    val year: Int,
    @Schema(
        description = "List of contributors to the citation source.",
    )
    val contributors: List<CitationContributor>,
)

data class SeqSetCitationSource(val source: CitationSource, val seqSetDOIs: Set<String> = emptySet())

@Schema(description = "A citation of a SeqSet.")
data class SeqSetCitation(val source: CitationSource)

data class SeqSetCitingSequence(
    @Schema(
        description = "The accession and version of the SeqSet that was cited.",
        type = "string",
        example = "PP_SS_1.1",
    )
    val seqSetAccessionVersion: String,
    @Schema(
        description = "The accession of the sequence within the cited SeqSet. Can be either versioned or unversioned.",
        type = "string",
        example = "PP_123456.1",
    )
    val sequenceAccession: String,
)

@Schema(description = "A citation of a sequence.")
data class SequenceCitation(val source: CitationSource, val seqSets: List<SeqSetCitingSequence>)

@Schema(description = "A citation of one or more SeqSets, with the SeqSets it references.")
data class AdminSeqSetCitation(val source: CitationSource, val seqSets: List<SeqSet>, val origin: CitationOrigin)

@Schema(description = "A request to manually register a publication or other source as citing one or more SeqSets.")
data class AddSeqSetCitationRequest(
    val source: CitationSource,
    @Schema(
        description = "Accession versions of the SeqSets that this source cites.",
        type = "array",
        example = "[\"PP_SS_1.1\"]",
    )
    val seqSetAccessionVersions: List<String>,
)

data class ResponseSeqSet(val seqSetId: String, val seqSetVersion: Long)

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
