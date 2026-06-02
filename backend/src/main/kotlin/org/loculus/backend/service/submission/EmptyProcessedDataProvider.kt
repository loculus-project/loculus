package org.loculus.backend.service.submission

import com.fasterxml.jackson.databind.node.NullNode
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.expandPerSegmentMetadata
import org.loculus.backend.config.perSegmentExpansionSegments
import org.loculus.backend.config.service.ConfigService
import org.springframework.stereotype.Component

@Component
class EmptyProcessedDataProvider(private val configService: ConfigService) {
    fun provide(organism: Organism): ProcessedData<GeneticSequence> {
        val organismConfig = configService.getOrganismConfig(organism).config
        val schema = organismConfig.schema
        val referenceGenome = organismConfig.referenceGenome

        // Expand perSegment fields (completeness -> completeness_L/_M/_S, ...) so the
        // released-data projection serves the same field set the pipeline produced
        // and SILO's adapter-rendered schema expects.
        val metadataFields = expandPerSegmentMetadata(schema.metadata, perSegmentExpansionSegments(organismConfig))
        val nucleotideSequences = referenceGenome.nucleotideSequences.map { it.name }.associateWith { null }
        return ProcessedData(
            metadata = metadataFields.map { it.name }.associateWith { NullNode.instance },
            unalignedNucleotideSequences = nucleotideSequences,
            alignedNucleotideSequences = nucleotideSequences,
            alignedAminoAcidSequences = referenceGenome.genes.map { it.name }.associateWith { null },
            nucleotideInsertions = referenceGenome.nucleotideSequences.map { it.name }.associateWith { emptyList() },
            aminoAcidInsertions = referenceGenome.genes.map { it.name }.associateWith { emptyList() },
            sequenceNameToFastaId = referenceGenome.nucleotideSequences.map { it.name }.associateWith { "" },
            files = null,
        )
    }
}
