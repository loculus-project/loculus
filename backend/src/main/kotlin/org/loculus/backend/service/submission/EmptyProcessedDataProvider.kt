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

        val nucleotideSequences = referenceGenomes.nucleotideSequences.map { it.name }.associateWith { null }
        return ProcessedData(
            metadata = schema.metadata.map { it.name }.associateWith { NullNode.instance },
            unalignedNucleotideSequences = nucleotideSequences,
            alignedNucleotideSequences = nucleotideSequences,
            alignedAminoAcidSequences = referenceGenomes.genes.map { it.name }.associateWith { null },
            nucleotideInsertions = referenceGenomes.nucleotideSequences.map { it.name }.associateWith { emptyList() },
            aminoAcidInsertions = referenceGenomes.genes.map { it.name }.associateWith { emptyList() },
            annotationObject = nucleotideSequences,
        )
    }
}
