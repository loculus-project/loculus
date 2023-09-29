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

    fun validateSequence(sequenceVersion: SequenceVersion): ValidationResult {
        val missingFields = mutableListOf<String>()
        val typeMismatchFields = mutableListOf<FieldError>()
        val unknownFields = mutableListOf<String>()

        if (sequenceVersion.data["metadata"] == null) {
            return ValidationResult(
                sequenceVersion.sequenceId,
                emptyList(),
                emptyList(),
                emptyList(),
                listOf("Missing field: metadata"),
            )
        }

        for (metadata in schemaConfig.schema.metadata) {
            val fieldName = metadata.name
            val fieldValue = sequenceVersion.data["metadata"][fieldName]

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

        sequenceVersion.data["metadata"].fieldNames().forEachRemaining { fieldName ->
            if (!knownFieldNames.contains(fieldName)) {
                unknownFields.add(fieldName)
            }
        }

        return ValidationResult(sequenceVersion.sequenceId, missingFields, typeMismatchFields, unknownFields)
    }

    fun isValidResult(validationResult: ValidationResult): Boolean {
        return validationResult.missingRequiredFields.isEmpty() &&
            validationResult.fieldsWithTypeMismatch.isEmpty() &&
            validationResult.unknownFields.isEmpty() &&
            validationResult.genericErrors.isEmpty()
    }
}

data class FieldError(
    val field: String,
    val shouldBeType: String,
    val fieldValue: String,
)

data class ValidationResult(
    val sequenceId: Long,
    val missingRequiredFields: List<String>,
    val fieldsWithTypeMismatch: List<FieldError>,
    val unknownFields: List<String>,
    val genericErrors: List<String> = emptyList(),
)
