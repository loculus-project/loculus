package org.loculus.backend.service

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.json.jsonb
import tools.jackson.databind.DeserializationFeature
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.KotlinModule
import tools.jackson.module.kotlin.readValue

val jacksonObjectMapper: ObjectMapper = JsonMapper.builder()
    .addModule(
        KotlinModule.Builder()
            .disable(tools.jackson.module.kotlin.KotlinFeature.StrictNullChecks)
            .build(),
    )
    .findAndAddModules()
    .disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
    .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
    .build()

inline fun <reified T : Any> Table.jacksonSerializableJsonb(columnName: String) = jsonb<T>(
    columnName,
    ::serialize,
    ::deserialize,
)

inline fun <reified T : Any> serialize(value: T): String = jacksonObjectMapper.writeValueAsString(value)

inline fun <reified T : Any> deserialize(value: String): T = jacksonObjectMapper.readValue(value)
