package org.pathoplexus.backend.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.NullNode
import io.swagger.v3.oas.annotations.media.Schema
import org.pathoplexus.backend.model.Metadata
import org.pathoplexus.backend.model.SchemaConfig
import org.pathoplexus.backend.service.ValidationErrorType.MissingRequiredField
import org.pathoplexus.backend.service.ValidationErrorType.TypeMismatch
import org.pathoplexus.backend.service.ValidationErrorType.UnknownField
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

private const val DATE_FORMAT = "yyyy-MM-dd"
private const val PANGO_LINEAGE_REGEX_PATTERN = "[a-zA-Z]{1,3}(\\.\\d{1,3}){0,3}"
private val pangoLineageRegex = Regex(PANGO_LINEAGE_REGEX_PATTERN)

@Component
class SequenceValidatorService
@Autowired constructor(private val schemaConfig: SchemaConfig) {

    fun isValidDate(dateStringCandidate: String): Boolean {
        val formatter = DateTimeFormatter.ofPattern(DATE_FORMAT)
        return try {
            LocalDate.parse(dateStringCandidate, formatter)
            true
        } catch (e: DateTimeParseException) {
            false
        }
    }

    fun isValidPangoLineage(pangoLineageCandidate: String): Boolean {
        return pangoLineageCandidate.matches(pangoLineageRegex)
    }

    fun validateType(fieldValue: JsonNode, metadata: Metadata): ValidationError? {
        if (fieldValue.isNull) {
            return null
        }

        when (metadata.type) {
            "date" -> {
                if (!isValidDate(fieldValue.asText())) {
                    return ValidationError.invalidDate(metadata.name, fieldValue)
                }
                return null
            }

            "pango_lineage" -> {
                if (!isValidPangoLineage(fieldValue.asText())) {
                    return ValidationError.invalidPangoLineage(metadata.name, fieldValue)
                }
                return null
            }
        }

        val isOfCorrectPrimitiveType = when (metadata.type) {
            "string" -> fieldValue.isTextual
            "integer" -> fieldValue.isInt
            "float" -> fieldValue.isFloat
            "double" -> fieldValue.isDouble
            "number" -> fieldValue.isNumber
            else -> throw RuntimeException(
                "Found unknown metadata type in config: ${metadata.type}. Refactor this to an enum",
            )
        }

        return when (isOfCorrectPrimitiveType) {
            true -> null
            false -> ValidationError.typeMismatch(metadata.name, metadata.type, fieldValue)
        }
    }

    fun validateSequence(submittedProcessedData: SubmittedProcessedData): ValidationResult {
        var validationResult: ValidationResult = ValidationResult.Ok()

        val metadataFields = schemaConfig.schema.metadata

        for (metadata in metadataFields) {
            val fieldName = metadata.name
            val fieldValue = submittedProcessedData.data.metadata[fieldName]

            if (metadata.required) {
                if (fieldValue == null) {
                    validationResult = validationResult.withErrorAppended(ValidationError.missingRequiredField(fieldName))
                    continue
                }

                if (fieldValue is NullNode) {
                    validationResult = validationResult.withErrorAppended(ValidationError.requiredFieldIsNull(fieldName))
                    continue
                }
            }

            if (fieldValue != null) {
                when (val validationError = validateType(fieldValue, metadata)) {
                    null -> {}
                    else -> validationResult = validationResult.withErrorAppended(validationError)
                }
            }
        }

        val knownFieldNames = metadataFields.map { it.name }

        val unknownFields = submittedProcessedData.data.metadata.keys.subtract(knownFieldNames.toSet())

        for (unknownField in unknownFields) {
            validationResult = validationResult.withErrorAppended(ValidationError.unknownField(unknownField))
        }

        return validationResult
    }
}

@Schema(
    oneOf = [ValidationResult.Ok::class, ValidationResult.Error::class],
    discriminatorProperty = "type",
)
sealed interface ValidationResult {
    val type: String

    fun withErrorAppended(validationError: ValidationError): ValidationResult

    class Ok : ValidationResult {
        @Schema(allowableValues = ["Ok"])
        override val type = "Ok"

        override fun withErrorAppended(validationError: ValidationError) = Error(listOf(validationError))
    }

    class Error(val validationErrors: List<ValidationError>) : ValidationResult {
        @Schema(allowableValues = ["Error"])
        override val type = "Error"

        override fun withErrorAppended(validationError: ValidationError) = Error(validationErrors + validationError)
    }
}

class ValidationError(val type: ValidationErrorType, val fieldName: String, val message: String) {
    companion object {
        fun missingRequiredField(field: String) = ValidationError(
            MissingRequiredField,
            field,
            "Missing the required field '$field'.",
        )

        fun requiredFieldIsNull(field: String) = ValidationError(
            MissingRequiredField,
            field,
            "Field '$field' is null, but a value is required.",
        )

        fun typeMismatch(fieldName: String, expectedType: String, fieldValue: JsonNode) = ValidationError(
            TypeMismatch,
            fieldName,
            "Expected type '$expectedType' for field '$fieldName', found value '$fieldValue'.",
        )

        fun invalidDate(fieldName: String, fieldValue: JsonNode) = ValidationError(
            TypeMismatch,
            fieldName,
            "Expected type 'date' in format '$DATE_FORMAT' for field '$fieldName', found value '$fieldValue'.",
        )

        fun invalidPangoLineage(fieldName: String, fieldValue: JsonNode) = ValidationError(
            TypeMismatch,
            fieldName,
            "Expected type 'pango_lineage' for field '$fieldName', found value '$fieldValue'. " +
                "A pango lineage must be of the form $PANGO_LINEAGE_REGEX_PATTERN, e.g. 'XBB' or 'BA.1.5'.",
        )

        fun unknownField(fieldName: String) = ValidationError(
            UnknownField,
            fieldName,
            "Found unknown field '$fieldName' in processed data.",
        )
    }
}

enum class ValidationErrorType {
    MissingRequiredField,
    TypeMismatch,
    UnknownField,
}
