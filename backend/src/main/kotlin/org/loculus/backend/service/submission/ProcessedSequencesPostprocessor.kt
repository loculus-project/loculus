package org.loculus.backend.service.submission

import com.fasterxml.jackson.databind.node.NullNode
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.BackendConfig
import org.springframework.stereotype.Service

@Service
class ProcessedSequencesPostprocessor(private val backendConfig: BackendConfig) {
    fun <SequenceType> stripNullValuesFromSequences(processedData: ProcessedData<SequenceType>) = processedData.copy(
        unalignedNucleotideSequences = processedData.unalignedNucleotideSequences
            .filterValues { it!=null },
        alignedNucleotideSequences = processedData.alignedNucleotideSequences
            .filterValues { it!=null },
    )

    /** Filter out any extra sequences that are not in the current schema and add nulls for any missing sequences. */
    fun <SequenceType> filterOutExtraSequencesAndAddNulls(processedData: ProcessedData<SequenceType>, organism: Organism) =
        processedData.copy(
            unalignedNucleotideSequences = backendConfig
                .getInstanceConfig(organism)
                .referenceGenome
                .nucleotideSequences
                .map { it.name }
                .associateWith { seqName ->
                    processedData.unalignedNucleotideSequences[seqName]
                },
            alignedNucleotideSequences = backendConfig
                .getInstanceConfig(organism)
                .referenceGenome
                .nucleotideSequences
                .map { it.name }
                .associateWith { seqName ->
                    processedData.alignedNucleotideSequences[seqName]
                },
        )
}
