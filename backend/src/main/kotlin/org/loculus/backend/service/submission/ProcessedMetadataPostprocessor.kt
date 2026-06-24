package org.loculus.backend.service.submission

import com.fasterxml.jackson.databind.node.NullNode
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.config.expandPerSegmentMetadata
import org.loculus.backend.config.perSegmentExpansionSegments
import org.loculus.backend.config.service.ConfigService
import org.springframework.stereotype.Service

@Service
class ProcessedMetadataPostprocessor(private val configService: ConfigService) {
    fun <SequenceType> stripNullValuesFromMetadata(processedData: ProcessedData<SequenceType>) =
        processedData.copy(metadata = processedData.metadata.filterNot { (_, value) -> value.isNull })

    /** Filter out any extra fields that are not in the current schema and add nulls for any missing fields. */
    fun <SequenceType> filterOutExtraFieldsAndAddNulls(processedData: ProcessedData<SequenceType>, organism: Organism) =
        processedData.copy(
            metadata = run {
                val config = configService.getOrganismConfig(organism).config
                // Expand perSegment fields (completeness -> completeness_L/_M/_S, ...) for
                // multi-segment organisms so stored per-segment values are kept (not dropped
                // as "extra"), matching SILO's adapter-rendered schema.
                expandPerSegmentMetadata(config.schema.metadata, perSegmentExpansionSegments(config))
                    .map { it.name }
                    .associateWith { fieldName ->
                        processedData.metadata[fieldName] ?: NullNode.instance
                    }
            },
        )
}
