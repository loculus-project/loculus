package org.loculus.backend.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.jetbrains.exposed.sql.QueryParameter
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.json.JsonBColumnType
import org.jetbrains.exposed.sql.json.jsonb
import org.loculus.backend.api.ProcessedData

val jacksonObjectMapper: ObjectMapper = jacksonObjectMapper().findAndRegisterModules()
inline fun <reified T : Any> Table.jacksonSerializableJsonb(columnName: String) = jsonb<T>(
    columnName,
    ::serialize,
    ::deserialize,
)

inline fun <reified T : Any> jsonbParam(value: T) = QueryParameter(
    value,
    JsonBColumnType<ProcessedData>(::serialize, ::deserialize),
)

inline fun <reified T : Any> serialize(value: T): String = jacksonObjectMapper.writeValueAsString(value)

inline fun <reified T : Any> deserialize(value: String): T = jacksonObjectMapper.readValue(value)
