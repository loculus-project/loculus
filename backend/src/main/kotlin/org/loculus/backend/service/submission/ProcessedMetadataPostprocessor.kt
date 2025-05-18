package org.loculus.backend.service.submission

import com.fasterxml.jackson.databind.node.NullNode
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.BackendConfig
import org.springframework.stereotype.Service

@Service
class ProcessedMetadataPostprocessor(private val backendConfig: BackendConfig) {
    fun <SequenceType> stripNullValuesFromMetadata(processedData: ProcessedData<SequenceType>) =
        processedData.copy(metadata = processedData.metadata.filterNot { (_, value) -> value.isNull })

    /** Filter out any extra fields that are not in the current schema and add nulls for any missing fields. */
    fun <SequenceType> filterOutExtraFieldsAndAddNulls(processedData: ProcessedData<SequenceType>, organism: Organism) =
        processedData.copy(
            metadata = backendConfig
                .getInstanceConfig(organism)
                .schema
                .metadata
                .map { it.name }
                .associateWith { fieldName ->
                    processedData.metadata[fieldName] ?: NullNode.instance
                },
        )
}
