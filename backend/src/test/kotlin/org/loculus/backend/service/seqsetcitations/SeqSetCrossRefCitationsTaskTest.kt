package org.loculus.backend.service.seqsetcitations

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.loculus.backend.api.CitationContributor
import org.loculus.backend.api.SeqSetCitingSource

class SeqSetCrossRefCitationsTaskTest {
    private fun citingSource(
        sourceDOI: String,
        title: String = "A citing paper",
        year: String = "2024",
        contributors: List<CitationContributor> = listOf(CitationContributor("Jane", "Doe")),
        seqSetDOIs: Set<String> = emptySet(),
    ) = SeqSetCitingSource(
        sourceDOI = sourceDOI,
        title = title,
        year = year,
        contributors = contributors,
        seqSetDOIs = seqSetDOIs,
    )

    @Test
    fun `mergeCitingSources unions seqSetDOIs for the same sourceDOI`() {
        val a = citingSource("10.5678/paper-1", seqSetDOIs = setOf("10.1234/seqset-a"))
        val b = citingSource("10.5678/paper-1", seqSetDOIs = setOf("10.1234/seqset-b"))
        val merged = mergeCitingSources(listOf(a, b))

        assertEquals(
            setOf(
                citingSource(
                    "10.5678/paper-1",
                    seqSetDOIs = setOf("10.1234/seqset-a", "10.1234/seqset-b"),
                ),
            ),
            merged,
        )
    }

    @Test
    fun `mergeCitingSources keeps distinct sources separate`() {
        val a = citingSource("10.5678/paper-1", seqSetDOIs = setOf("10.1234/seqset-a"))
        val b = citingSource("10.5678/paper-2", seqSetDOIs = setOf("10.1234/seqset-b"))
        val merged = mergeCitingSources(listOf(a, b))

        assertEquals(setOf(a, b), merged)
    }

    @Test
    fun `mergeCitingSources unions seqSetDOIs even when other metadata conflicts, keeping latest`() {
        val first = citingSource(
            "10.5678/paper-1",
            title = "Original title",
            seqSetDOIs = setOf("10.1234/seqset-a"),
        )
        val second = citingSource(
            "10.5678/paper-1",
            title = "Updated title",
            seqSetDOIs = setOf("10.1234/seqset-b"),
        )
        val merged = mergeCitingSources(listOf(first, second))

        assertEquals(
            setOf(
                citingSource(
                    "10.5678/paper-1",
                    title = "Updated title",
                    seqSetDOIs = setOf("10.1234/seqset-a", "10.1234/seqset-b"),
                ),
            ),
            merged,
        )
    }

    @Test
    fun `mergeCitingSources returns empty set for empty input`() {
        assertEquals(emptySet<SeqSetCitingSource>(), mergeCitingSources(emptyList()))
    }
}
