package org.pathoplexus.backend.config

import org.pathoplexus.backend.api.Organism

data class BackendConfig(
    val instances: Map<String, InstanceConfig>,
) {
    fun getInstanceConfig(organism: Organism) = instances[organism.name] ?: throw IllegalArgumentException(
        "Organism: ${organism.name} not found in backend config. Available organisms: ${instances.keys}",
    )
}

data class InstanceConfig(
    val schema: Schema,
    val referenceGenomes: ReferenceGenome,
)

data class Schema(
    val instanceName: String,
    val metadata: List<Metadata>,
)

data class Metadata(
    val name: String,
    // TODO(#538) make this an enum
    val type: String,
    val required: Boolean = false,
)
