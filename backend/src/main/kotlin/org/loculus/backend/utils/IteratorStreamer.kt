package org.loculus.backend.utils

import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper
import java.io.OutputStream

@Service
class IteratorStreamer(private val objectMapper: ObjectMapper) {
    fun <T> streamAsNdjson(sequence: Sequence<T>, outputStream: OutputStream) =
        streamAsNdjson(sequence.iterator(), outputStream)

    fun <T> streamAsNdjson(iterator: Iterator<T>, outputStream: OutputStream) {
        iterator.forEach {
            val json = objectMapper.writeValueAsString(it)
            outputStream.write(json.toByteArray())
            outputStream.write('\n'.code)
            outputStream.flush()
        }
    }
}
