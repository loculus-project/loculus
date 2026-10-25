package org.loculus.backend.api

import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Constraint
import jakarta.validation.ConstraintValidator
import jakarta.validation.ConstraintValidatorContext
import jakarta.validation.Payload
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.ORGANISM_SCHEMA_NAME
import org.springframework.core.convert.converter.Converter
import org.springframework.stereotype.Component
import kotlin.reflect.KClass

@ValidOrganism
@Schema(ref = "#/components/schemas/$ORGANISM_SCHEMA_NAME")
data class Organism(val name: String)

@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
@Constraint(validatedBy = [OrganismValidator::class])
annotation class ValidOrganism(
    val message: String = "Invalid organism",
    val groups: Array<KClass<*>> = [],
    val payload: Array<KClass<out Payload>> = [],
)

class OrganismValidator(private val backendConfig: BackendConfig) : ConstraintValidator<ValidOrganism, Organism> {
    override fun isValid(value: Organism, context: ConstraintValidatorContext): Boolean {
        val keys = backendConfig.organisms.keys
        if (keys.contains(value.name)) {
            return true
        }
        context.buildConstraintViolationWithTemplate("Invalid organism: ${value.name}, possible values are: $keys")
            .addConstraintViolation()
        return false
    }
}

@Component
class OrganismConverter : Converter<String, Organism> {
    override fun convert(source: String) = Organism(source)
}
