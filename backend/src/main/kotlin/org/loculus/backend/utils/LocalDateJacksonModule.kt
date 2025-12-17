package org.loculus.backend.utils

import tools.jackson.core.JsonGenerator
import tools.jackson.core.JsonParser
import tools.jackson.databind.DeserializationContext
import tools.jackson.databind.ValueDeserializer
import tools.jackson.databind.ValueSerializer
import tools.jackson.databind.SerializationContext
import tools.jackson.databind.module.SimpleModule
import kotlinx.datetime.LocalDate
import org.springframework.context.annotation.Configuration

@Configuration
class LocalDateJacksonModule : SimpleModule() {
    init {
        addSerializer(LocalDate::class.java, LocalDateSerializer())
        addDeserializer(LocalDate::class.java, LocalDateDeserializer())
    }
}

class LocalDateSerializer : ValueSerializer<LocalDate>() {
    override fun serialize(value: LocalDate, gen: JsonGenerator, ctxt: SerializationContext) {
        gen.writeString(value.toString())
    }
}

class LocalDateDeserializer : ValueDeserializer<LocalDate>() {
    override fun deserialize(p: JsonParser, ctxt: DeserializationContext): LocalDate = LocalDate.parse(p.text)
}