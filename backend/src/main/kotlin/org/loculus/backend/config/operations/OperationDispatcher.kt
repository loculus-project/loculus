package org.loculus.backend.config.operations

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component

data class OperationRequest(val type: String, val payload: JsonNode)

@Component
class OperationDispatcher(private val registry: OperationRegistry, private val objectMapper: ObjectMapper) {

    fun applyOne(op: OperationRequest, draft: ConfigDocument): AppliedOperation {
        val handler = registry.get(op.type)
        val payload = objectMapper.treeToValue(op.payload, handler.payloadClass.java)
            ?: throw OperationValidationException(
                listOf(ValidationError("payload", "could not parse payload for ${op.type}")),
            )
        return applyTyped(handler, payload, draft, op.type)
    }

    fun applyMany(ops: List<OperationRequest>, draft: ConfigDocument): AppliedBatch {
        var current = draft
        val applied = mutableListOf<AppliedOperation>()
        for (op in ops) {
            val step = applyOne(op, current)
            current = step.newDraft
            applied += step
        }
        return AppliedBatch(newDraft = current, applied = applied)
    }

    @Suppress("UNCHECKED_CAST")
    private fun <P : Any> applyTyped(
        handler: OperationHandler<P>,
        payload: Any,
        draft: ConfigDocument,
        opType: String,
    ): AppliedOperation {
        val typedPayload = payload as P
        handler.validate(typedPayload, draft).throwIfInvalid()
        val newDraft = handler.apply(typedPayload, draft)
        val summary = handler.summary(typedPayload, draft)
        return AppliedOperation(opType = opType, payload = payload, summary = summary, newDraft = newDraft)
    }
}

data class AppliedOperation(val opType: String, val payload: Any, val summary: String, val newDraft: ConfigDocument)

data class AppliedBatch(val newDraft: ConfigDocument, val applied: List<AppliedOperation>)
