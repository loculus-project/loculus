package org.loculus.backend.service.seqsetcitations

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.loculus.backend.api.CitationContributor
import org.loculus.backend.api.CitationSource
import org.loculus.backend.api.SeqSetCitationSource

class SeqSetCrossRefCitationsTaskTest {
    private fun citationSource(
        sourceDOI: String,
        title: String = "A citing paper",
        year: Int = 2024,
        contributors: List<CitationContributor> = listOf(CitationContributor("Jane", "Doe")),
        seqSetDOIs: Set<String> = emptySet(),
    ) = SeqSetCitationSource(
        CitationSource(
            sourceDOI = sourceDOI,
            title = title,
            year = year,
            contributors = contributors,
        ),
        seqSetDOIs = seqSetDOIs,
    )

    @Test
    fun `mergeCitationSources unions seqSetDOIs for the same sourceDOI`() {
        val a = citationSource("10.5678/paper-1", seqSetDOIs = setOf("10.1234/seqset-a"))
        val b = citationSource("10.5678/paper-1", seqSetDOIs = setOf("10.1234/seqset-b"))
        val merged = mergeCitationSources(listOf(a, b))

        assertEquals(
            setOf(
                citationSource(
                    "10.5678/paper-1",
                    seqSetDOIs = setOf("10.1234/seqset-a", "10.1234/seqset-b"),
                ),
            ),
            merged,
        )
    }

    @Test
    fun `mergeCitationSources keeps distinct sources separate`() {
        val a = citationSource("10.5678/paper-1", seqSetDOIs = setOf("10.1234/seqset-a"))
        val b = citationSource("10.5678/paper-2", seqSetDOIs = setOf("10.1234/seqset-b"))
        val merged = mergeCitationSources(listOf(a, b))

        assertEquals(setOf(a, b), merged)
    }

    @Test
    fun `mergeCitationSources unions seqSetDOIs even when other metadata conflicts, keeping latest`() {
        val first = citationSource(
            "10.5678/paper-1",
            title = "Original title",
            seqSetDOIs = setOf("10.1234/seqset-a"),
        )
        val second = citationSource(
            "10.5678/paper-1",
            title = "Updated title",
            seqSetDOIs = setOf("10.1234/seqset-b"),
        )
        val merged = mergeCitationSources(listOf(first, second))

        assertEquals(
            setOf(
                citationSource(
                    "10.5678/paper-1",
                    title = "Updated title",
                    seqSetDOIs = setOf("10.1234/seqset-a", "10.1234/seqset-b"),
                ),
            ),
            merged,
        )
    }

    @Test
    fun `mergeCitationSources returns empty set for empty input`() {
        assertEquals(emptySet<SeqSetCitationSource>(), mergeCitationSources(emptyList()))
    }
}
