package org.pathoplexus.backend.config

import com.fasterxml.jackson.annotation.JsonProperty
import org.pathoplexus.backend.service.AminoAcidSequence
import org.pathoplexus.backend.service.NucleotideSequence

data class ReferenceGenome(
    @JsonProperty("nucleotideSequences")
    val segments: List<GenomeSegment>,
    val genes: List<Gene>,
)

data class GenomeSegment(
    val name: String,
    val sequence: NucleotideSequence,
)

data class Gene(
    val name: String,
    val sequence: AminoAcidSequence,
)
