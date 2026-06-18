package org.loculus.backend.config.operations.handlers

import org.loculus.backend.config.operations.ConfigDocument
import org.loculus.backend.config.operations.OperationHandler
import org.loculus.backend.config.operations.OperationScope
import org.loculus.backend.config.operations.ValidationError
import org.loculus.backend.config.operations.ValidationResult
import org.springframework.stereotype.Component
import kotlin.reflect.KClass

data class ReorderMetadataFieldsPayload(val order: List<String>)

@Component
class ReorderMetadataFieldsHandler : OperationHandler<ReorderMetadataFieldsPayload> {
    override val opType = "reorderMetadataFields"
    override val payloadClass: KClass<ReorderMetadataFieldsPayload> = ReorderMetadataFieldsPayload::class
    override val scope = OperationScope.ORGANISM

    override fun validate(payload: ReorderMetadataFieldsPayload, draft: ConfigDocument): ValidationResult {
        if (draft !is ConfigDocument.Organism) {
            return ValidationResult.Invalid(listOf(ValidationError("scope", "expected organism scope")))
        }
        val errors = mutableListOf<ValidationError>()
        val current = draft.config.schema.metadata.map { it.name }
        val supplied = payload.order

        if (supplied.size != supplied.toSet().size) {
            errors.add(ValidationError("order", "must not contain duplicates"))
        }
        val currentSet = current.toSet()
        val suppliedSet = supplied.toSet()
        val missing = currentSet - suppliedSet
        val extra = suppliedSet - currentSet
        if (missing.isNotEmpty()) {
            errors.add(ValidationError("order", "missing fields: ${missing.sorted().joinToString(", ")}"))
        }
        if (extra.isNotEmpty()) {
            errors.add(ValidationError("order", "unknown fields: ${extra.sorted().joinToString(", ")}"))
        }
        return if (errors.isEmpty()) ValidationResult.Valid else ValidationResult.Invalid(errors)
    }

    override fun apply(payload: ReorderMetadataFieldsPayload, draft: ConfigDocument): ConfigDocument {
        val organism = (draft as ConfigDocument.Organism).config
        val byName = organism.schema.metadata.associateBy { it.name }
        val reordered = payload.order.map { byName.getValue(it) }
        return ConfigDocument.Organism(organism.copy(schema = organism.schema.copy(metadata = reordered)))
    }

    override fun summary(payload: ReorderMetadataFieldsPayload, draft: ConfigDocument): String =
        "Reorder metadata fields (${payload.order.size} fields)"
}
