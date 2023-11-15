package org.pathoplexus.backend.config

data class BackendConfig(
    val instances: Map<String, InstanceConfig>,
)

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
    val type: String,
    val required: Boolean = false,
)
