package org.loculus.backend.controller

import mu.KotlinLogging
import org.apache.commons.compress.compressors.zstandard.ZstdCompressorOutputStream
import org.jetbrains.exposed.sql.transactions.transaction
import org.loculus.backend.api.CompressionFormat
import org.loculus.backend.api.Organism
import org.loculus.backend.log.ORGANISM_MDC_KEY
import org.loculus.backend.log.REQUEST_ID_MDC_KEY
import org.loculus.backend.log.RequestIdContext
import org.loculus.backend.utils.IteratorStreamer
import org.slf4j.MDC
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

private val log = KotlinLogging.logger { }

abstract class BaseController(
    private val iteratorStreamer: IteratorStreamer,
    private val requestIdContext: RequestIdContext,
) {
    fun <T> streamTransactioned(
        compressionFormat: CompressionFormat? = null,
        endpoint: String,
        organism: Organism,
        sequenceProvider: () -> Sequence<T>,
    ) = StreamingResponseBody { responseBodyStream ->
        val startTime = System.currentTimeMillis()
        MDC.put(REQUEST_ID_MDC_KEY, requestIdContext.requestId)
        MDC.put(ORGANISM_MDC_KEY, organism.name)

        val outputStream = when (compressionFormat) {
            CompressionFormat.ZSTD -> ZstdCompressorOutputStream(responseBodyStream)
            null -> responseBodyStream
        }

        outputStream.use { stream ->
            transaction {
                try {
                    iteratorStreamer.streamAsNdjson(sequenceProvider(), stream)
                } catch (e: Exception) {
                    val duration = System.currentTimeMillis() - startTime
                    log.error(e) {
                        "[$endpoint] An unexpected error occurred while streaming after ${duration}ms, aborting the stream: $e"
                    }
                    stream.write(
                        "An unexpected error occurred while streaming, aborting the stream: ${e.message}".toByteArray(),
                    )
                }
            }
        }

        val duration = System.currentTimeMillis() - startTime
        log.info { "[$endpoint] Streaming response completed in ${duration}ms" }

        MDC.remove(REQUEST_ID_MDC_KEY)
        MDC.remove(ORGANISM_MDC_KEY)
    }
}
