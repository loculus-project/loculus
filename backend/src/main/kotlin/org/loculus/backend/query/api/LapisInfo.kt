package org.loculus.backend.query.api

import com.fasterxml.jackson.core.JsonGenerator
import java.time.LocalDateTime
import java.time.ZoneOffset

const val LAPIS_VERSION = "loculus-query-engine"
const val REPORT_TO = "Please report to https://github.com/GenSpectrum/LAPIS/issues in case you encounter any " +
    "unexpected issues. Please include the request ID and the requestInfo in your report."

/** the `info` object of LAPIS responses (also the body of /sample/info) */
data class LapisInfo(
    val dataVersion: String?,
    val requestId: String,
    val requestInfo: String,
    val reportTo: String = REPORT_TO,
    val lapisVersion: String = LAPIS_VERSION,
) {
    fun write(generator: JsonGenerator) {
        generator.writeStartObject()
        generator.writeStringField("dataVersion", dataVersion)
        generator.writeStringField("requestId", requestId)
        generator.writeStringField("requestInfo", requestInfo)
        generator.writeStringField("reportTo", reportTo)
        generator.writeStringField("lapisVersion", lapisVersion)
        generator.writeEndObject()
    }

    companion object {
        fun create(dataVersion: String?, requestId: String, instanceName: String, host: String) = LapisInfo(
            dataVersion = dataVersion,
            requestId = requestId,
            requestInfo = "$instanceName on $host at ${LocalDateTime.now(ZoneOffset.UTC)}",
        )
    }
}
