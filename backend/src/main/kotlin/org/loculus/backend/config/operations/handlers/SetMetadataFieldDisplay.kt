package org.loculus.backend.config.operations.handlers

import org.loculus.backend.config.operations.ConfigDocument
import org.loculus.backend.config.operations.OperationHandler
import org.loculus.backend.config.operations.OperationScope
import org.loculus.backend.config.operations.ValidationError
import org.loculus.backend.config.operations.ValidationResult
import org.springframework.stereotype.Component
import kotlin.reflect.KClass

data class SetMetadataFieldDisplayPayload(
    val field: String,
    val displayName: String? = null,
    val description: String? = null,
    val header: String? = null,
    val hidden: Boolean? = null,
    val customDisplay: Map<String, Any>? = null,
)

@Component
class SetMetadataFieldDisplayHandler : OperationHandler<SetMetadataFieldDisplayPayload> {
    override val opType = "setMetadataFieldDisplay"
    override val payloadClass: KClass<SetMetadataFieldDisplayPayload> = SetMetadataFieldDisplayPayload::class
    override val scope = OperationScope.ORGANISM

    override fun validate(payload: SetMetadataFieldDisplayPayload, draft: ConfigDocument): ValidationResult {
        if (draft !is ConfigDocument.Organism) {
            return ValidationResult.Invalid(listOf(ValidationError("scope", "expected organism scope")))
        }
        val exists = draft.config.schema.metadata.any { it.name == payload.field }
        if (!exists) {
            return ValidationResult.Invalid(
                listOf(ValidationError("field", "no metadata field named '${payload.field}'")),
            )
        }
        return ValidationResult.Valid
    }

    override fun apply(payload: SetMetadataFieldDisplayPayload, draft: ConfigDocument): ConfigDocument {
        val organism = (draft as ConfigDocument.Organism).config
        val updatedMetadata = organism.schema.metadata.map { field ->
            if (field.name != payload.field) {
                field
            } else {
                field.copy(
                    displayName = payload.displayName ?: field.displayName,
                    description = payload.description ?: field.description,
                    header = payload.header ?: field.header,
                    hidden = payload.hidden ?: field.hidden,
                    customDisplay = payload.customDisplay ?: field.customDisplay,
                )
            }
        }
        return ConfigDocument.Organism(organism.copy(schema = organism.schema.copy(metadata = updatedMetadata)))
    }

    override fun summary(payload: SetMetadataFieldDisplayPayload, draft: ConfigDocument): String {
        val changes = buildList {
            payload.displayName?.let { add("displayName='$it'") }
            payload.description?.let { add("description set") }
            payload.header?.let { add("header='$it'") }
            payload.hidden?.let { add("hidden=$it") }
            if (payload.customDisplay != null) add("customDisplay set")
        }
        val verb = if (changes.isEmpty()) "no-op" else changes.joinToString(", ")
        return "Set display on field '${payload.field}': $verb"
    }
}
