package org.loculus.backend.config

import org.loculus.backend.api.AminoAcidSequence
import org.loculus.backend.api.NucleotideSequence

data class ReferenceGenome(
    val nucleotideSequences: List<ReferenceSequence>,
    val genes: List<ReferenceSequence>,
) {
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

    fun getNucleotideSegmentReference(segmentName: String): NucleotideSequence? = nucleotideSequences.find {
        it.name == segmentName
    }?.sequence

    fun getAminoAcidGeneReference(gene: String): AminoAcidSequence? = genes.find {
        it.name == gene
    }?.sequence

    private fun shortenSequence(sequence: String): String {
        return if (sequence.length > 10) {
            sequence.substring(0, 10) + "..."
        } else {
            sequence
        }
    }

    private fun referenceListToString(list: List<ReferenceSequence>) = list.joinToString(", ") {
        it.copy(sequence = shortenSequence(it.sequence)).toString()
    }
}

data class ReferenceSequence(
    val name: String,
    val sequence: String,
)
