package org.pathoplexus.backend.config

import org.pathoplexus.backend.api.AminoAcidSequence
import org.pathoplexus.backend.api.NucleotideSequence

data class ReferenceGenome(
    val nucleotideSequences: List<ReferenceSequence>,
    val genes: List<ReferenceSequence>,
) {
    init {
        if (nucleotideSequences.size == 1 && nucleotideSequences.single().name != "main") {
            throw IllegalArgumentException("If there is only one nucleotide sequence, it must be named 'main'")
        }
    }

    fun getNucleotideSegmentReference(segmentName: String): NucleotideSequence? = nucleotideSequences.find {
        it.name == segmentName
    }?.sequence

    fun getAminoAcidGeneReference(gene: String): AminoAcidSequence? = genes.find {
        it.name == gene
    }?.sequence
}

data class ReferenceSequence(
    val name: String,
    val sequence: String,
)
