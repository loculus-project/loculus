package org.loculus.backend.api

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonPropertyOrder
import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.fasterxml.jackson.annotation.JsonTypeName
import com.fasterxml.jackson.core.JsonGenerator
import com.fasterxml.jackson.databind.SerializerProvider
import com.fasterxml.jackson.databind.annotation.JsonSerialize
import com.fasterxml.jackson.databind.ser.std.StdSerializer
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit.Companion.YEAR
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.loculus.backend.config.logger
import org.loculus.backend.controller.BadRequestException

enum class DataUseTermsType {
    OPEN,
    RESTRICTED,
}

val logger = KotlinLogging.logger { }

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes(
    JsonSubTypes.Type(value = DataUseTerms.Open::class, name = "OPEN"),
    JsonSubTypes.Type(value = DataUseTerms.Restricted::class, name = "RESTRICTED"),
)
@JsonPropertyOrder(value = ["type", "restrictedUntil", "changeDateTime"])
sealed interface DataUseTerms {
    val type: DataUseTermsType

    @JsonTypeName("OPEN")
    data class Open(private val dummy: String = "") :
        DataUseTerms {
        @JsonIgnore
        override val type = DataUseTermsType.OPEN
    }

    @JsonTypeName("RESTRICTED")
    data class Restricted(
        @JsonSerialize(using = LocalDateSerializer::class)
        val restrictedUntil: LocalDate,
    ) : DataUseTerms {
        @JsonIgnore
        override val type = DataUseTermsType.RESTRICTED
    }

    companion object {
        fun fromParameters(type: DataUseTermsType, restrictedUntilString: String?): DataUseTerms {
            logger.info { "Creating DataUseTerms from parameters: type=$type, restrictedUntil=$restrictedUntilString" }
            return when (type) {
                DataUseTermsType.OPEN -> Open()
                DataUseTermsType.RESTRICTED -> {
                    val restrictedUntil = parseRestrictedUntil(restrictedUntilString)
                    validateRestrictedUntil(restrictedUntil)
                    Restricted(restrictedUntil)
                }
            }
        }

        private fun parseRestrictedUntil(restrictedUntilString: String?): LocalDate {
            if (restrictedUntilString == null) {
                throw BadRequestException("The date 'restrictedUntil' must be set if 'dataUseTermsType' is RESTRICTED.")
            }
            return try {
                LocalDate.parse(restrictedUntilString)
            } catch (e: Exception) {
                throw BadRequestException(
                    "The date 'restrictedUntil' must be a valid date in the format YYYY-MM-DD: $restrictedUntilString.",
                )
            }
        }

        private fun validateRestrictedUntil(restrictedUntil: LocalDate) {
            val now = Clock.System.now().toLocalDateTime(TimeZone.UTC).date
            val oneYearFromNow = now.plus(1, YEAR)

            if (restrictedUntil < now) {
                throw BadRequestException(
                    "The date 'restrictedUntil' must be in the future, up to a maximum of 1 year from now.",
                )
            }
            if (restrictedUntil > oneYearFromNow) {
                throw BadRequestException(
                    "The date 'restrictedUntil' must not exceed 1 year from today.",
                )
            }
        }
    }
}

class LocalDateSerializer : StdSerializer<LocalDate>(LocalDate::class.java) {
    override fun serialize(value: LocalDate, gen: JsonGenerator, provider: SerializerProvider) {
        gen.writeString(value.toString())
    }
}

class LocalDateTimeSerializer : StdSerializer<LocalDateTime>(LocalDateTime::class.java) {
    override fun serialize(value: LocalDateTime, gen: JsonGenerator, provider: SerializerProvider) {
        gen.writeString(value.toString())
    }
}
