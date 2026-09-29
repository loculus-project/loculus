package org.loculus.backend.query.store

import com.fasterxml.jackson.core.JsonToken
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper

/**
 * Extracts top-level [fields] from a JSON object text with Postgres `->>` semantics: strings unquoted, numbers
 * in their original spelling, booleans as true/false, JSON null or missing keys as null, nested values as JSON
 * text. Keys that are not requested are skipped without being materialised. Thread-safe.
 */
class JsonFieldExtractor(private val fields: List<String>) {
    private val positionByName: Map<String, Int> = fields.withIndex().associate { it.value to it.index }

    fun extract(json: String): Array<String?> {
        val values = arrayOfNulls<String>(fields.size)
        mapper.createParser(json).use { parser ->
            if (parser.nextToken() != JsonToken.START_OBJECT) return values
            while (parser.nextToken() == JsonToken.FIELD_NAME) {
                val position = positionByName[parser.currentName()]
                val token = parser.nextToken()
                if (position == null) {
                    parser.skipChildren()
                    continue
                }
                values[position] = when (token) {
                    JsonToken.VALUE_NULL -> null
                    JsonToken.START_OBJECT, JsonToken.START_ARRAY -> parser.readValueAsTree<JsonNode>().toString()
                    else -> parser.text
                }
            }
        }
        return values
    }

    private companion object {
        val mapper = ObjectMapper()
    }
}
