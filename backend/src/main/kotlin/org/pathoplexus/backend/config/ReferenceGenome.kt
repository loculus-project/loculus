package org.pathoplexus.backend.config

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
}

data class ReferenceSequence(
    val name: String,
    val sequence: NucleotideSequence,
)
