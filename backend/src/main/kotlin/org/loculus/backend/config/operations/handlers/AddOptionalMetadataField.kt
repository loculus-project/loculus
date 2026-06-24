package org.loculus.backend.config.operations.handlers

import org.loculus.backend.config.Metadata
import org.loculus.backend.config.MetadataType
import org.loculus.backend.config.operations.ConfigDocument
import org.loculus.backend.config.operations.OperationHandler
import org.loculus.backend.config.operations.OperationScope
import org.loculus.backend.config.operations.ValidationError
import org.loculus.backend.config.operations.ValidationResult
import org.springframework.stereotype.Component
import kotlin.reflect.KClass

data class AddOptionalMetadataFieldPayload(
    val name: String,
    val type: MetadataType,
    val displayName: String? = null,
    val description: String? = null,
    val header: String? = null,
    val hidden: Boolean? = null,
    val customDisplay: Map<String, Any>? = null,
)

@Component
class AddOptionalMetadataFieldHandler : OperationHandler<AddOptionalMetadataFieldPayload> {
    override val opType = "addOptionalMetadataField"
    override val payloadClass: KClass<AddOptionalMetadataFieldPayload> = AddOptionalMetadataFieldPayload::class
    override val scope = OperationScope.ORGANISM

    override fun validate(payload: AddOptionalMetadataFieldPayload, draft: ConfigDocument): ValidationResult {
        if (draft !is ConfigDocument.Organism) {
            return ValidationResult.Invalid(listOf(ValidationError("scope", "expected organism scope")))
        }
        val errors = mutableListOf<ValidationError>()
        if (payload.name.isBlank()) errors.add(ValidationError("name", "must not be blank"))
        if (draft.config.schema.metadata.any { it.name == payload.name }) {
            errors.add(ValidationError("name", "field '${payload.name}' already exists"))
        }
        return if (errors.isEmpty()) ValidationResult.Valid else ValidationResult.Invalid(errors)
    }

    override fun apply(payload: AddOptionalMetadataFieldPayload, draft: ConfigDocument): ConfigDocument {
        val organism = (draft as ConfigDocument.Organism).config
        val field = Metadata(
            name = payload.name,
            type = payload.type,
            required = false,
            displayName = payload.displayName,
            description = payload.description,
            header = payload.header,
            hidden = payload.hidden,
            customDisplay = payload.customDisplay,
        )
        return ConfigDocument.Organism(
            organism.copy(schema = organism.schema.copy(metadata = organism.schema.metadata + field)),
        )
    }

    override fun summary(payload: AddOptionalMetadataFieldPayload, draft: ConfigDocument): String =
        "Add optional metadata field '${payload.name}' (${payload.type})"
}
