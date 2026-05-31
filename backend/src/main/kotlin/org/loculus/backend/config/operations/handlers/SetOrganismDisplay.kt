package org.loculus.backend.config.operations.handlers

import org.loculus.backend.config.OrganismImage
import org.loculus.backend.config.operations.ConfigDocument
import org.loculus.backend.config.operations.OperationHandler
import org.loculus.backend.config.operations.OperationScope
import org.loculus.backend.config.operations.ValidationError
import org.loculus.backend.config.operations.ValidationResult
import org.springframework.stereotype.Component
import kotlin.reflect.KClass

data class SetOrganismDisplayPayload(
    val displayName: String? = null,
    val description: String? = null,
    val image: OrganismImage? = null,
)

@Component
class SetOrganismDisplayHandler : OperationHandler<SetOrganismDisplayPayload> {
    override val opType = "setOrganismDisplay"
    override val payloadClass: KClass<SetOrganismDisplayPayload> = SetOrganismDisplayPayload::class
    override val scope = OperationScope.ORGANISM

    override fun validate(payload: SetOrganismDisplayPayload, draft: ConfigDocument): ValidationResult {
        if (draft !is ConfigDocument.Organism) {
            return ValidationResult.Invalid(listOf(ValidationError("scope", "expected organism scope")))
        }
        val errors = mutableListOf<ValidationError>()
        if (payload.displayName?.isBlank() == true) {
            errors.add(ValidationError("displayName", "must not be blank if provided"))
        }
        if (payload.image?.url?.isBlank() == true) {
            errors.add(ValidationError("image.url", "must not be blank if provided"))
        }
        return if (errors.isEmpty()) ValidationResult.Valid else ValidationResult.Invalid(errors)
    }

    override fun apply(payload: SetOrganismDisplayPayload, draft: ConfigDocument): ConfigDocument {
        val organism = (draft as ConfigDocument.Organism).config
        return ConfigDocument.Organism(
            organism.copy(
                displayName = payload.displayName ?: organism.displayName,
                description = payload.description ?: organism.description,
                image = payload.image ?: organism.image,
            ),
        )
    }

    override fun summary(payload: SetOrganismDisplayPayload, draft: ConfigDocument): String {
        val changes = buildList {
            payload.displayName?.let { add("displayName='$it'") }
            payload.description?.let { add("description set") }
            if (payload.image != null) add("image set")
        }
        return if (changes.isEmpty()) {
            "No-op set organism display"
        } else {
            "Set organism display: ${changes.joinToString(", ")}"
        }
    }
}
