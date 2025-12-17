package org.loculus.backend.service

import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.KotlinModule
import tools.jackson.module.kotlin.readValue
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.json.jsonb

val jacksonObjectMapper: ObjectMapper = JsonMapper.builder()
    .addModule(KotlinModule.Builder().build())
    .findAndAddModules()
    .build()

inline fun <reified T : Any> Table.jacksonSerializableJsonb(columnName: String) = jsonb<T>(
    columnName,
    ::serialize,
    ::deserialize,
)

inline fun <reified T : Any> serialize(value: T): String = jacksonObjectMapper.writeValueAsString(value)

inline fun <reified T : Any> deserialize(value: String): T = jacksonObjectMapper.readValue(value)