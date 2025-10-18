package org.loculus.backend.config

import org.loculus.backend.api.GeneticSequence

data class ReferenceGenome(val nucleotideSequences: List<ReferenceSequence>, val genes: List<ReferenceSequence>) {
    init {
        if (nucleotideSequences.size == 1 && nucleotideSequences.single().name != "main") {
            throw IllegalArgumentException("If there is only one nucleotide sequence, it must be named 'main'")
        }
    }

    override fun toString(): String {
        val nucleotideSequencesString = referenceListToString(nucleotideSequences)
        val genesString = referenceListToString(genes)
        return "ReferenceGenome(nucleotideSequences=[$nucleotideSequencesString], genes=[$genesString])"
    }

    fun allSegmentsConcatenated(): String = nucleotideSequences.joinToString(separator = "") { it.sequence }

    fun getNucleotideSegmentReference(segmentName: String): GeneticSequence? = nucleotideSequences
        .find { it.name == segmentName }
        ?.sequence

    fun getAminoAcidGeneReference(gene: String): GeneticSequence? = genes
        .find { it.name == gene }
        ?.sequence

    private fun shortenSequence(sequence: String) = when {
        sequence.length > 10 -> sequence.substring(0, 10) + "..."
        else -> sequence
    }

    private fun referenceListToString(list: List<ReferenceSequence>) = list.joinToString(", ") {
        it.copy(sequence = shortenSequence(it.sequence)).toString()
    }
}

data class ReferenceSequence(val name: String, val sequence: String)
