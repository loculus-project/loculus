package org.loculus.backend.utils

import com.fasterxml.jackson.databind.ObjectMapper
import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Service
import java.io.OutputStream

private val log = KotlinLogging.logger { }

@Service
class IteratorStreamer(private val objectMapper: ObjectMapper) {
    fun <T> streamAsNdjson(sequence: Sequence<T>, outputStream: OutputStream, requestId: String? = null) =
        streamAsNdjson(sequence.iterator(), outputStream, requestId)

    fun <T> streamAsNdjson(iterator: Iterator<T>, outputStream: OutputStream, requestId: String? = null) {
        var count = 0
        var serializationTime = 0L
        var writeTime = 0L

        iterator.forEach {
            val serStart = System.currentTimeMillis()
            val json = objectMapper.writeValueAsString(it)
            serializationTime += System.currentTimeMillis() - serStart

            val writeStart = System.currentTimeMillis()
            outputStream.write(json.toByteArray())
            outputStream.write('\n'.code)
            outputStream.flush()
            writeTime += System.currentTimeMillis() - writeStart

            count++
        }

        log.debug { "streamAsNdjson: Streamed $count entries, serialization=${serializationTime}ms, write=${writeTime}ms, requestId=$requestId" }
    }
}
