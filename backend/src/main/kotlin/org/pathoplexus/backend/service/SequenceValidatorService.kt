package org.pathoplexus.backend.service

import com.fasterxml.jackson.databind.JsonNode
import org.pathoplexus.backend.model.Metadata
import org.pathoplexus.backend.model.SchemaConfig
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

@Component
class SequenceValidatorService
@Autowired constructor(private val schemaConfig: SchemaConfig) {

    fun isValidDate(dateStringCandidate: String): Boolean {
        val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")
        return try {
            LocalDate.parse(dateStringCandidate, formatter)
            true
        } catch (e: DateTimeParseException) {
            false
        }
    }

    fun isValidFloatingPointNumber(floatStringCandidate: String): Boolean {
        return try {
            floatStringCandidate.toDouble()
            true
        } catch (e: NumberFormatException) {
            false
        }
    }

    fun isValidIntegerNumber(numberStringCandidate: String): Boolean {
        return try {
            numberStringCandidate.toInt()
            true
        } catch (e: NumberFormatException) {
            false
        }
    }

    fun isValidPangoLineage(pangoLineageCandidate: String): Boolean {
        return pangoLineageCandidate.matches(Regex("[a-zA-Z]{1,3}(\\.\\d{1,3}){0,3}"))
    }

    fun validateFieldType(fieldValue: JsonNode, metadata: Metadata): Boolean {
        if (fieldValue.isNull) {
            return true
        }
        return when (metadata.type) {
            "string" -> fieldValue.isTextual
            "int" -> fieldValue.isInt
            "float" -> fieldValue.isFloat
            "double" -> fieldValue.isDouble
            "number" -> fieldValue.isNumber
            "date" -> isValidDate(fieldValue.asText())
            "pango_lineage" -> isValidPangoLineage(fieldValue.asText())
            else -> false
        }
    }

    fun validateSequence(sequence: Sequence): ValidationResult {
        val missingFields = mutableListOf<String>()
        val typeMismatchFields = mutableListOf<FieldError>()
        val unknownFields = mutableListOf<String>()

        if (sequence.data["metadata"] == null) {
            return ValidationResult(
                sequence.sequenceId,
                emptyList(),
                emptyList(),
                emptyList(),
                listOf("Missing metadata field"),
            )
        }

        for (metadata in schemaConfig.schema.metadata) {
            val fieldName = metadata.name
            val fieldValue = sequence.data["metadata"][fieldName]

            if (fieldValue == null && metadata.required) {
                missingFields.add(fieldName)
            }

            if (fieldValue != null) {
                if (!validateFieldType(fieldValue, metadata)) {
                    typeMismatchFields.add(FieldError(fieldName, metadata.type, fieldValue.toString()))
                }
            }
        }

        val knownFieldNames = schemaConfig.schema.metadata.map { it.name }

        sequence.data["metadata"].fieldNames().forEachRemaining { fieldName ->
            if (!knownFieldNames.contains(fieldName)) {
                unknownFields.add(fieldName)
            }
        }

        return ValidationResult(sequence.sequenceId, missingFields, typeMismatchFields, unknownFields)
    }

    fun isValidResult(validationResult: ValidationResult): Boolean {
        return validationResult.missingRequiredFields.isEmpty() &&
            validationResult.fieldsWithTypeMismatch.isEmpty() &&
            validationResult.unknownFields.isEmpty() &&
            validationResult.genericError.isEmpty()
    }
}

data class FieldError(
    val field: String,
    val shouldBeType: String,
    val fieldValue: String,
)

data class ValidationResult(
    val id: Long,
    val missingRequiredFields: List<String>,
    val fieldsWithTypeMismatch: List<FieldError>,
    val unknownFields: List<String>,
    val genericError: List<String> = emptyList(),
)
