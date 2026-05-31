package org.loculus.backend.service.submission

import com.fasterxml.jackson.databind.node.NullNode
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.service.ConfigService
import org.springframework.stereotype.Service

@Service
class ProcessedSequencesPostprocessor(private val configService: ConfigService) {
    fun <SequenceType> stripNullValuesFromSequences(processedData: ProcessedData<SequenceType>) = processedData.copy(
        unalignedNucleotideSequences = processedData.unalignedNucleotideSequences
            .filterValues { it != null },
        alignedNucleotideSequences = processedData.alignedNucleotideSequences
            .filterValues { it != null },
        alignedAminoAcidSequences = processedData.alignedAminoAcidSequences
            .filterValues { it != null },
        aminoAcidInsertions = processedData.aminoAcidInsertions
            .filterValues { !it.isNullOrEmpty() },
        nucleotideInsertions = processedData.nucleotideInsertions
            .filterValues { !it.isNullOrEmpty() },
    )

    /** Filter out any extra sequences that are not in the current schema and add nulls for any missing sequences. */
    fun <SequenceType> filterOutExtraSequencesAndAddNulls(
        processedData: ProcessedData<SequenceType>,
        organism: Organism,
    ): ProcessedData<SequenceType> {
        val referenceGenome = configService.getOrganismConfig(organism).config.referenceGenome
        val nucleotideSequenceNames = referenceGenome.nucleotideSequences.map { it.name }
        val geneNames = referenceGenome.genes.map { it.name }
        return processedData.copy(
            unalignedNucleotideSequences = nucleotideSequenceNames.associateWith {
                processedData.unalignedNucleotideSequences[it]
            },
            alignedNucleotideSequences = nucleotideSequenceNames.associateWith {
                processedData.alignedNucleotideSequences[it]
            },
            alignedAminoAcidSequences = geneNames.associateWith {
                processedData.alignedAminoAcidSequences[it]
            },
            aminoAcidInsertions = geneNames.associateWith {
                processedData.aminoAcidInsertions[it] ?: emptyList()
            },
            nucleotideInsertions = nucleotideSequenceNames.associateWith {
                processedData.nucleotideInsertions[it] ?: emptyList()
            },
        )
    }
}
