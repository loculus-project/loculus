package org.loculus.backend.service.submission

import com.fasterxml.jackson.databind.node.NullNode
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.BackendConfig
import org.springframework.stereotype.Service

@Service
class MetadataSchemaEnforcementService(private val backendConfig: BackendConfig) {
    /** Ensures all schema-defined metadata fields are present in processed data.
     * Missing fields are added with null values to maintain schema completeness. */
    fun <T> enforceMetadataSchemaInProcessedData(
        processedData: ProcessedData<T>,
        organism: Organism,
    ): ProcessedData<T> {
        val schema = backendConfig.getInstanceConfig(organism).schema
        val existingMetadata = processedData.metadata

        val hydratedMetadata = schema.metadata
            .map { it.name }
            .associateWith { fieldName ->
                existingMetadata[fieldName] ?: NullNode.instance
            }

        return processedData.copy(metadata = hydratedMetadata)
    }
}
