package org.loculus.backend.query.projection

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.JsonNodeFactory
import com.fasterxml.jackson.databind.node.ObjectNode
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.MetadataField
import java.time.LocalDate
import java.time.format.DateTimeParseException

private val nodes = JsonNodeFactory.instance
private val DATE_PATTERN = Regex("""\d{4}-\d{2}-\d{2}""")

/**
 * Turns a get-released-data metadata record into the LAPIS record of the query engine: exactly the fields of the
 * SILO database config, in schema order, missing fields as null, values coerced to the field type
 * (STRING -> text, INT -> long, FLOAT -> double, DATE -> 'YYYY-MM-DD' text, BOOLEAN -> boolean).
 * Values that cannot be coerced become null.
 */
class LapisMetadataNormalizer(private val fields: List<MetadataField>) {
    fun normalize(metadata: Map<String, JsonNode>): ObjectNode {
        val result = ObjectNode(nodes, LinkedHashMap(fields.size * 2))
        for (field in fields) {
            result.set<JsonNode>(field.name, coerce(field.type, metadata[field.name]))
        }
        return result
    }

    companion object {
        fun coerce(type: FieldType, value: JsonNode?): JsonNode {
            if (value == null || value.isNull || value.isMissingNode) return nodes.nullNode()
            return when (type) {
                FieldType.STRING -> when {
                    value.isTextual -> value
                    value.isValueNode -> nodes.textNode(value.asText())
                    else -> nodes.textNode(value.toString())
                }

                FieldType.INT -> when {
                    value.isIntegralNumber && value.canConvertToLong() -> nodes.numberNode(value.longValue())

                    value.isFloatingPointNumber -> {
                        val d = value.doubleValue()
                        if (d == Math.rint(d) && !d.isInfinite()) nodes.numberNode(d.toLong()) else null
                    }

                    value.isTextual -> value.textValue().trim().toLongOrNull()?.let { nodes.numberNode(it) }

                    else -> null
                } ?: nodes.nullNode()

                FieldType.FLOAT -> when {
                    value.isNumber -> nodes.numberNode(value.doubleValue())
                    value.isTextual -> value.textValue().trim().toDoubleOrNull()?.let { nodes.numberNode(it) }
                    else -> null
                } ?: nodes.nullNode()

                FieldType.DATE -> if (value.isTextual && isValidDate(value.textValue())) {
                    value
                } else {
                    nodes.nullNode()
                }

                FieldType.BOOLEAN -> when {
                    value.isBoolean -> value
                    value.isTextual && value.textValue() == "true" -> nodes.booleanNode(true)
                    value.isTextual && value.textValue() == "false" -> nodes.booleanNode(false)
                    else -> nodes.nullNode()
                }
            }
        }

        fun isValidDate(text: String): Boolean {
            if (!DATE_PATTERN.matches(text)) return false
            return try {
                LocalDate.parse(text)
                true
            } catch (_: DateTimeParseException) {
                false
            }
        }
    }
}
