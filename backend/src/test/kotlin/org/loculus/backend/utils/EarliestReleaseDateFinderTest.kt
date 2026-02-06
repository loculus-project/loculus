package org.loculus.backend.utils

import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.format
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.service.submission.RawProcessedData

class EarliestReleaseDateFinderTest {

    @Test
    fun `GIVEN multiple versions THEN the release date of the first version is used for all versions`() {
        val finder = EarliestReleaseDateFinder(emptyList())

        assert(finder, row("A", 1L, monthDay(1, 1)), monthDay(1, 1))
        assert(finder, row("A", 2L, monthDay(2, 1)), monthDay(1, 1))

        assert(finder, row("B", 1L, monthDay(2, 1)), monthDay(2, 1))
        assert(finder, row("B", 2L, monthDay(3, 1)), monthDay(2, 1))
    }

    @Test
    fun `GIVEN an external field is earlier THEN the external field is used`() {
        val finder = EarliestReleaseDateFinder(listOf("foo"))

        assert(finder, row("A", 1L, monthDay(10, 1), mapOf("foo" to monthDay(1, 1))), monthDay(1, 1))
        assert(finder, row("A", 2L, monthDay(10, 2), mapOf("foo" to monthDay(1, 2))), monthDay(1, 1))

        assert(finder, row("B", 1L, monthDay(10, 1), mapOf("foo" to null)), monthDay(10, 1))
        assert(finder, row("B", 2L, monthDay(10, 2), mapOf("foo" to monthDay(1, 2))), monthDay(1, 2))
    }
}

fun assert(finder: EarliestReleaseDateFinder, row: RawProcessedData, expected: LocalDateTime) {
    assertThat(finder.calculateEarliestReleaseDate(row), equalTo(expected))
}

fun monthDay(month: Int, day: Int) = LocalDateTime(2024, month, day, 0, 0, 0)

fun row(
    accession: String,
    version: Long,
    releasedAt: LocalDateTime,
    fieldValues: Map<String, LocalDateTime?> = emptyMap(),
) = RawProcessedData(
    accession = accession,
    version = version,
    releasedAtTimestamp = releasedAt,
    processedData = ProcessedData(
        metadata = fieldValues.map { (field, date) ->
            field to
                if (date != null) TextNode(date.date.format(LocalDate.Formats.ISO)) else NullNode.getInstance()
        }.toMap(),
        unalignedNucleotideSequences = emptyMap(),
        alignedNucleotideSequences = emptyMap(),
        nucleotideInsertions = emptyMap(),
        alignedAminoAcidSequences = emptyMap(),
        aminoAcidInsertions = emptyMap(),
        sequenceNameToFastaId = emptyMap(),
        files = null,
    ),
    isRevocation = false,
    versionComment = null,
    submitter = "foo",
    submissionId = "foo",
    submittedAtTimestamp = releasedAt,
    groupId = 0,
    groupName = "foo",
    dataUseTerms = DataUseTerms.Open,
    pipelineVersion = 0,
    dataUseTermsChangeDate = releasedAt,
)

// Notes:
// - What about revocations?
