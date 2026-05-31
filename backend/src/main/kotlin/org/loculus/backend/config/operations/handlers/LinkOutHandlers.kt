package org.loculus.backend.config.operations.handlers

import org.loculus.backend.config.LinkOut
import org.loculus.backend.config.operations.ConfigDocument
import org.loculus.backend.config.operations.OperationHandler
import org.loculus.backend.config.operations.OperationScope
import org.loculus.backend.config.operations.ValidationError
import org.loculus.backend.config.operations.ValidationResult
import org.springframework.stereotype.Component
import kotlin.reflect.KClass

data class AddLinkOutPayload(val linkOut: LinkOut)

@Component
class AddLinkOutHandler : OperationHandler<AddLinkOutPayload> {
    override val opType = "addLinkOut"
    override val payloadClass: KClass<AddLinkOutPayload> = AddLinkOutPayload::class
    override val scope = OperationScope.ORGANISM

    override fun validate(payload: AddLinkOutPayload, draft: ConfigDocument): ValidationResult {
        if (draft !is ConfigDocument.Organism) {
            return ValidationResult.Invalid(listOf(ValidationError("scope", "expected organism scope")))
        }
        val errors = mutableListOf<ValidationError>()
        val link = payload.linkOut
        if (link.name.isBlank()) errors.add(ValidationError("linkOut.name", "must not be blank"))
        if (link.url.isBlank()) errors.add(ValidationError("linkOut.url", "must not be blank"))
        if (link.maxNumberOfRecommendedEntries != null && link.maxNumberOfRecommendedEntries < 1) {
            errors.add(ValidationError("linkOut.maxNumberOfRecommendedEntries", "must be at least 1 if provided"))
        }
        if (draft.config.schema.linkOuts.any { it.name == link.name }) {
            errors.add(ValidationError("linkOut.name", "name '${link.name}' already exists"))
        }
        return if (errors.isEmpty()) ValidationResult.Valid else ValidationResult.Invalid(errors)
    }

    override fun apply(payload: AddLinkOutPayload, draft: ConfigDocument): ConfigDocument {
        val organism = (draft as ConfigDocument.Organism).config
        return ConfigDocument.Organism(
            organism.copy(
                schema = organism.schema.copy(linkOuts = organism.schema.linkOuts + payload.linkOut),
            ),
        )
    }

    override fun summary(payload: AddLinkOutPayload, draft: ConfigDocument): String =
        "Add link-out '${payload.linkOut.name}'"
}

data class UpdateLinkOutPayload(
    val name: String,
    val url: String? = null,
    val maxNumberOfRecommendedEntries: Int? = null,
    val onlyForReferences: Map<String, String>? = null,
    val category: String? = null,
)

@Component
class UpdateLinkOutHandler : OperationHandler<UpdateLinkOutPayload> {
    override val opType = "updateLinkOut"
    override val payloadClass: KClass<UpdateLinkOutPayload> = UpdateLinkOutPayload::class
    override val scope = OperationScope.ORGANISM

    override fun validate(payload: UpdateLinkOutPayload, draft: ConfigDocument): ValidationResult {
        if (draft !is ConfigDocument.Organism) {
            return ValidationResult.Invalid(listOf(ValidationError("scope", "expected organism scope")))
        }
        val errors = mutableListOf<ValidationError>()
        if (draft.config.schema.linkOuts.none { it.name == payload.name }) {
            errors.add(ValidationError("name", "no link-out with name '${payload.name}'"))
        }
        if (payload.url != null && payload.url.isBlank()) {
            errors.add(ValidationError("url", "must not be blank if provided"))
        }
        if (payload.maxNumberOfRecommendedEntries != null && payload.maxNumberOfRecommendedEntries < 1) {
            errors.add(ValidationError("maxNumberOfRecommendedEntries", "must be at least 1 if provided"))
        }
        return if (errors.isEmpty()) ValidationResult.Valid else ValidationResult.Invalid(errors)
    }

    override fun apply(payload: UpdateLinkOutPayload, draft: ConfigDocument): ConfigDocument {
        val organism = (draft as ConfigDocument.Organism).config
        val updated = organism.schema.linkOuts.map { link ->
            if (link.name != payload.name) {
                link
            } else {
                link.copy(
                    url = payload.url ?: link.url,
                    maxNumberOfRecommendedEntries =
                    payload.maxNumberOfRecommendedEntries ?: link.maxNumberOfRecommendedEntries,
                    onlyForReferences = payload.onlyForReferences ?: link.onlyForReferences,
                    category = payload.category ?: link.category,
                )
            }
        }
        return ConfigDocument.Organism(organism.copy(schema = organism.schema.copy(linkOuts = updated)))
    }

    override fun summary(payload: UpdateLinkOutPayload, draft: ConfigDocument): String {
        val changes = buildList {
            payload.url?.let { add("url set") }
            payload.maxNumberOfRecommendedEntries?.let { add("maxNumberOfRecommendedEntries=$it") }
            payload.onlyForReferences?.let { add("onlyForReferences set") }
            payload.category?.let { add("category='$it'") }
        }
        val verb = if (changes.isEmpty()) "no-op" else changes.joinToString(", ")
        return "Update link-out '${payload.name}': $verb"
    }
}

data class RemoveLinkOutPayload(val name: String)

@Component
class RemoveLinkOutHandler : OperationHandler<RemoveLinkOutPayload> {
    override val opType = "removeLinkOut"
    override val payloadClass: KClass<RemoveLinkOutPayload> = RemoveLinkOutPayload::class
    override val scope = OperationScope.ORGANISM

    override fun validate(payload: RemoveLinkOutPayload, draft: ConfigDocument): ValidationResult {
        if (draft !is ConfigDocument.Organism) {
            return ValidationResult.Invalid(listOf(ValidationError("scope", "expected organism scope")))
        }
        if (draft.config.schema.linkOuts.none { it.name == payload.name }) {
            return ValidationResult.Invalid(listOf(ValidationError("name", "no link-out with name '${payload.name}'")))
        }
        return ValidationResult.Valid
    }

    override fun apply(payload: RemoveLinkOutPayload, draft: ConfigDocument): ConfigDocument {
        val organism = (draft as ConfigDocument.Organism).config
        return ConfigDocument.Organism(
            organism.copy(
                schema = organism.schema.copy(
                    linkOuts = organism.schema.linkOuts.filterNot { it.name == payload.name },
                ),
            ),
        )
    }

    override fun summary(payload: RemoveLinkOutPayload, draft: ConfigDocument): String =
        "Remove link-out '${payload.name}'"
}
