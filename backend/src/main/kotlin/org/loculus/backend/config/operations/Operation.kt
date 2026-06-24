package org.loculus.backend.config.operations

import org.loculus.backend.config.InstanceConfig
import org.loculus.backend.config.OrganismConfig
import org.springframework.stereotype.Component
import kotlin.reflect.KClass

enum class OperationScope { INSTANCE, ORGANISM }

sealed interface ConfigDocument {
    data class Instance(val config: InstanceConfig) : ConfigDocument
    data class Organism(val config: OrganismConfig) : ConfigDocument
}

sealed interface ValidationResult {
    data object Valid : ValidationResult
    data class Invalid(val errors: List<ValidationError>) : ValidationResult
}

data class ValidationError(val path: String, val message: String)

fun ValidationResult.throwIfInvalid() {
    if (this is ValidationResult.Invalid) {
        throw OperationValidationException(errors)
    }
}

class OperationValidationException(val errors: List<ValidationError>) :
    RuntimeException("Operation validation failed: ${errors.joinToString { "${it.path}: ${it.message}" }}")

class UnknownOperationException(val opType: String) : RuntimeException("Unknown operation type: $opType")

interface OperationHandler<P : Any> {
    val opType: String
    val payloadClass: KClass<P>
    val scope: OperationScope

    fun validate(payload: P, draft: ConfigDocument): ValidationResult
    fun apply(payload: P, draft: ConfigDocument): ConfigDocument
    fun summary(payload: P, draft: ConfigDocument): String
}

@Component
class OperationRegistry(handlers: List<OperationHandler<*>>) {
    private val byType: Map<String, OperationHandler<*>>

    init {
        val duplicates = handlers.groupBy { it.opType }.filterValues { it.size > 1 }.keys
        require(duplicates.isEmpty()) { "Duplicate operation handler opType(s): $duplicates" }
        byType = handlers.associateBy { it.opType }
    }

    fun get(opType: String): OperationHandler<*> = byType[opType] ?: throw UnknownOperationException(opType)

    fun types(): Set<String> = byType.keys

    fun typesByScope(scope: OperationScope): List<String> =
        byType.values.filter { it.scope == scope }.map { it.opType }.sorted()
}
