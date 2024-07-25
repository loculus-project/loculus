package org.loculus.backend.api

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonPropertyOrder
import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.fasterxml.jackson.annotation.JsonTypeName
import com.fasterxml.jackson.core.JsonGenerator
import com.fasterxml.jackson.databind.SerializerProvider
import com.fasterxml.jackson.databind.annotation.JsonSerialize
import com.fasterxml.jackson.databind.ser.std.StdSerializer
import io.swagger.v3.oas.annotations.media.Schema
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.utils.Accession

data class DataUseTermsHistoryEntry(
    val accession: Accession,
    @Schema(
        description = "The date time string (ISO-8601) until which the sequence entry is restricted.",
        type = "string",
        format = "date",
        example = "2007-12-03T10:15:30",
    )
    val changeDate: String,
    val dataUseTerms: DataUseTerms,
    @Schema(
        description = "The user who changed the data use terms of the sequence entry.",
        type = "string",
    )
    val userName: String,
)

enum class DataUseTermsType {
    @JsonProperty("OPEN")
    OPEN,

    @JsonProperty("RESTRICTED")
    RESTRICTED,

    ;

    companion object {
        private val stringToEnumMap: Map<String, DataUseTermsType> = entries.associateBy { it.name }

        fun fromString(dataUseTermsTypeString: String): DataUseTermsType = stringToEnumMap[dataUseTermsTypeString]
            ?: throw IllegalArgumentException("Unknown DataUseTermsType: $dataUseTermsTypeString")
    }
}

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes(
    JsonSubTypes.Type(value = DataUseTerms.Open::class, name = "OPEN"),
    JsonSubTypes.Type(value = DataUseTerms.Restricted::class, name = "RESTRICTED"),
)
@JsonPropertyOrder(value = ["type", "restrictedUntil"])
sealed interface DataUseTerms {
    val type: DataUseTermsType

    @JsonTypeName("OPEN")
    @Schema(description = "The sequence entry is open access. No restrictions apply.")
    data object Open : DataUseTerms {
        @JsonIgnore
        override val type = DataUseTermsType.OPEN
    }

    @JsonTypeName("RESTRICTED")
    @Schema(description = "The sequence entry is restricted access.")
    data class Restricted(
        @JsonSerialize(using = LocalDateSerializer::class)
        @Schema(
            description = "The date (YYYY-MM-DD) until which the sequence entry is restricted.",
            type = "string",
            format = "date",
            example = "2021-01-01",
        )
        val restrictedUntil: LocalDate,
    ) : DataUseTerms {
        @JsonIgnore
        override val type = DataUseTermsType.RESTRICTED
    }

    companion object {
        fun fromParameters(type: DataUseTermsType, restrictedUntilString: String?): DataUseTerms = when (type) {
            DataUseTermsType.OPEN -> Open
            DataUseTermsType.RESTRICTED -> Restricted(parseRestrictedUntil(restrictedUntilString))
        }

        fun fromParameters(type: DataUseTermsType, restrictedUntilString: LocalDate?): DataUseTerms = when (type) {
            DataUseTermsType.OPEN -> Open
            DataUseTermsType.RESTRICTED ->
                if (restrictedUntilString == null) {
                    throw BadRequestException(
                        "The date 'restrictedUntil' must be set if 'dataUseTermsType' is RESTRICTED.",
                    )
                } else {
                    Restricted(restrictedUntilString)
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
    }
}

data class DataUseTermsChangeRequest(
    @Schema(description = "A list of accessions of the dataset to set the data use terms for")
    val accessions: List<Accession>,
    val newDataUseTerms: DataUseTerms,
)

private class LocalDateSerializer : StdSerializer<LocalDate>(LocalDate::class.java) {
    override fun serialize(value: LocalDate, gen: JsonGenerator, provider: SerializerProvider) {
        gen.writeString(value.toString())
    }
}

private class LocalDateTimeSerializer : StdSerializer<LocalDateTime>(LocalDateTime::class.java) {
    override fun serialize(value: LocalDateTime, gen: JsonGenerator, provider: SerializerProvider) {
        gen.writeString(value.toString())
    }
}
