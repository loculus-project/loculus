package org.loculus.backend.query.api

import com.fasterxml.jackson.core.JsonToken
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.QuerySchema

/**
 * Extracts [fields] (canonical names) from a stored LAPIS metadata record (query_entries.metadata as JSON
 * text) into a row of typed values, using a streaming parser (no tree building).
 * Values are normalised to the schema type so that output is independent of how Postgres' jsonb prints
 * numbers (e.g. floats are re-serialised like Java doubles, as LAPIS does).
 */
class MetadataProjector(schema: QuerySchema, private val fields: List<String>) {
    private val positionByName: Map<String, Int> = fields.withIndex().associate { it.value to it.index }
    private val types: Array<FieldType?> = Array(fields.size) { schema.field(fields[it])?.type }

    fun project(json: String): Row {
        val row = arrayOfNulls<Any?>(fields.size)
        lapisJsonFactory.createParser(json).use { parser ->
            if (parser.nextToken() != JsonToken.START_OBJECT) return row
            while (parser.nextToken() == JsonToken.FIELD_NAME) {
                val position = positionByName[parser.currentName()]
                val token = parser.nextToken()
                if (position == null) {
                    parser.skipChildren()
                    continue
                }
                row[position] = when (token) {
                    JsonToken.VALUE_NULL -> null

                    JsonToken.VALUE_STRING -> convertText(parser.text, types[position])

                    JsonToken.VALUE_NUMBER_INT -> when (types[position]) {
                        FieldType.FLOAT -> parser.doubleValue
                        else -> parser.longValue
                    }

                    JsonToken.VALUE_NUMBER_FLOAT -> when (types[position]) {
                        FieldType.INT -> parser.longValue
                        else -> parser.doubleValue
                    }

                    JsonToken.VALUE_TRUE -> true

                    JsonToken.VALUE_FALSE -> false

                    else -> {
                        parser.skipChildren()
                        null
                    }
                }
            }
        }
        return row
    }

    companion object {
        /** converts a text value (JSON string, or Postgres `->>` text) to the LAPIS-typed value */
        fun convertText(text: String?, type: FieldType?): Any? {
            if (text == null) return null
            return when (type) {
                FieldType.INT -> text.toLongOrNull() ?: text.toDoubleOrNull()?.toLong() ?: text
                FieldType.FLOAT -> text.toDoubleOrNull() ?: text
                FieldType.BOOLEAN -> text.toBooleanStrictOrNull() ?: text
                else -> text
            }
        }
    }
}
