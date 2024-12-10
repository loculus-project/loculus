package org.loculus.backend.utils

import com.fasterxml.jackson.databind.node.TextNode
import kotlinx.datetime.LocalDateTime
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.service.submission.RawProcessedData

class EarliestReleaseDateFinderTest {
}

fun createDummyRow(
    accession: String,
    version: Long,
    releasedAt: LocalDateTime,
    fieldValues: Map<String, LocalDateTime> = emptyMap()
) = RawProcessedData(
    accession = accession,
    version = version,
    releasedAtTimestamp = releasedAt,
    processedData = ProcessedData(
        metadata = fieldValues.map { (field, date) -> field to TextNode(date.toString()) }.toMap(),
        unalignedNucleotideSequences = emptyMap(),
        alignedNucleotideSequences = emptyMap(),
        nucleotideInsertions = emptyMap(),
        alignedAminoAcidSequences = emptyMap(),
        aminoAcidInsertions = emptyMap()
    ),
    isRevocation = false,
    versionComment = null,
    submitter = "foo",
    submissionId = "foo",
    submittedAtTimestamp = releasedAt,
    groupId = 0,
    groupName = "foo",
    dataUseTerms = DataUseTerms.Open
)

// Notes:
// - What about revocations?
