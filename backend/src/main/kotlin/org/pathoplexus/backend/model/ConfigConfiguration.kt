package org.pathoplexus.backend.model

data class Metadata(
    val name: String,
    val type: String,
    val autocomplete: Boolean = false,
    val required: Boolean = false,
)

data class SchemaConfig(
    val schema: SchemaInfo,
)

data class SchemaInfo(
    val instanceName: String,
    val metadata: List<Metadata>,
    val tableColumns: List<String>,
    val primaryKey: String,
)
