package org.loculus.backend.service.submission

import com.fasterxml.jackson.databind.node.NullNode
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.BackendConfig
import org.springframework.stereotype.Component

@Component
class EmptyProcessedDataProvider(private val backendConfig: BackendConfig) {
    fun provide(organism: Organism): ProcessedData<GeneticSequence> {
        val (schema, referenceGenomes) = backendConfig.getInstanceConfig(organism)
        val referenceGenome = referenceGenomes.values.first()

        val nucleotideSequences = referenceGenome.nucleotideSequences.map { it.name }.associateWith { null }
        return ProcessedData(
            metadata = schema.metadata.map { it.name }.associateWith { NullNode.instance },
            unalignedNucleotideSequences = nucleotideSequences,
            alignedNucleotideSequences = nucleotideSequences,
            alignedAminoAcidSequences = referenceGenome.genes.map { it.name }.associateWith { null },
            nucleotideInsertions = referenceGenome.nucleotideSequences.map { it.name }.associateWith { emptyList() },
            aminoAcidInsertions = referenceGenome.genes.map { it.name }.associateWith { emptyList() },
            files = null,
        )
    }
}
