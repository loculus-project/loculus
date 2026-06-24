package org.loculus.backend.config.operations.handlers

import org.loculus.backend.config.Logo
import org.loculus.backend.config.SupportContact
import org.loculus.backend.config.operations.ConfigDocument
import org.loculus.backend.config.operations.OperationHandler
import org.loculus.backend.config.operations.OperationScope
import org.loculus.backend.config.operations.ValidationError
import org.loculus.backend.config.operations.ValidationResult
import org.springframework.stereotype.Component
import kotlin.reflect.KClass

data class SetInstanceBrandingPayload(
    val name: String? = null,
    val description: String? = null,
    val logo: Logo? = null,
    val supportContact: SupportContact? = null,
)

@Component
class SetInstanceBrandingHandler : OperationHandler<SetInstanceBrandingPayload> {
    override val opType = "setInstanceBranding"
    override val payloadClass: KClass<SetInstanceBrandingPayload> = SetInstanceBrandingPayload::class
    override val scope = OperationScope.INSTANCE

    override fun validate(payload: SetInstanceBrandingPayload, draft: ConfigDocument): ValidationResult {
        if (draft !is ConfigDocument.Instance) {
            return ValidationResult.Invalid(listOf(ValidationError("scope", "expected instance scope")))
        }
        if (payload.name != null && payload.name.isBlank()) {
            return ValidationResult.Invalid(listOf(ValidationError("name", "must not be blank if provided")))
        }
        return ValidationResult.Valid
    }

    override fun apply(payload: SetInstanceBrandingPayload, draft: ConfigDocument): ConfigDocument {
        val instance = (draft as ConfigDocument.Instance).config
        return ConfigDocument.Instance(
            instance.copy(
                name = payload.name ?: instance.name,
                description = payload.description ?: instance.description,
                logo = payload.logo ?: instance.logo,
                supportContact = payload.supportContact ?: instance.supportContact,
            ),
        )
    }

    override fun summary(payload: SetInstanceBrandingPayload, draft: ConfigDocument): String {
        val changes = buildList {
            payload.name?.let { add("name='$it'") }
            payload.description?.let { add("description='$it'") }
            if (payload.logo != null) add("logo set")
            if (payload.supportContact != null) add("supportContact set")
        }
        return if (changes.isEmpty()) {
            "No-op set instance branding"
        } else {
            "Set instance branding: ${changes.joinToString(
                ", ",
            )}"
        }
    }
}
