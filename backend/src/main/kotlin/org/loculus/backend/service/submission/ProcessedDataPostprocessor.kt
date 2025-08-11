package org.loculus.backend.service.submission

import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.springframework.stereotype.Service

@Service
class ProcessedDataPostprocessor(
    private val compressionService: CompressionService,
    private val processedMetadataPostprocessor: ProcessedMetadataPostprocessor,
    private val processedSequencesPostprocessor: ProcessedSequencesPostprocessor,
) {
    fun prepareForStorage(processedData: ProcessedData<String>, organism: Organism) = processedData
        .let { processedSequencesPostprocessor.stripNullValuesFromSequences(it) }
        .let { compressionService.compressSequencesInProcessedData(it, organism) }
        .let { processedMetadataPostprocessor.stripNullValuesFromMetadata(it) }

    fun retrieveFromStoredValue(storedValue: ProcessedData<CompressedSequence>, organism: Organism) = storedValue
        .let { processedMetadataPostprocessor.filterOutExtraFieldsAndAddNulls(it, organism) }
        .let { compressionService.decompressSequencesInProcessedData(it, organism) }
        .let { processedSequencesPostprocessor.filterOutExtraSequencesAndAddNulls(it, organism) }
}
