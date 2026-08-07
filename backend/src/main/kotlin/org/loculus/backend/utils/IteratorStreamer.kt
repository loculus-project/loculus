package org.loculus.backend.utils

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Service
import java.io.OutputStream

@Service
class IteratorStreamer(private val objectMapper: ObjectMapper) {
    /** Writes NDJSON, returns the record count, and can skip flushing each record. */
    fun <T> streamAsNdjson(sequence: Sequence<T>, outputStream: OutputStream, flushPerRecord: Boolean = true): Long =
        streamAsNdjson(sequence.iterator(), outputStream, flushPerRecord)

    fun <T> streamAsNdjson(iterator: Iterator<T>, outputStream: OutputStream, flushPerRecord: Boolean = true): Long {
        var count = 0L
        iterator.forEach {
            val json = objectMapper.writeValueAsString(it)
            outputStream.write(json.toByteArray())
            outputStream.write('\n'.code)
            if (flushPerRecord) {
                outputStream.flush()
            }
            count++
        }
        return count
    }
}
