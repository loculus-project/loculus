package org.loculus.backend.utils

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import java.io.ByteArrayOutputStream

class IteratorStreamerTest {
    private val streamer = IteratorStreamer(jacksonObjectMapper())

    @Test
    fun `returns the number of records written and one ndjson line per record`() {
        val output = ByteArrayOutputStream()

        val count = streamer.streamAsNdjson(sequenceOf("a", "b", "c"), output)

        assertThat(count, `is`(3L))
        val lines = output.toString(Charsets.UTF_8).lines().filter { it.isNotEmpty() }
        assertThat(lines, `is`(listOf("\"a\"", "\"b\"", "\"c\"")))
    }

    @Test
    fun `returns zero and writes nothing for an empty sequence`() {
        val output = ByteArrayOutputStream()

        val count = streamer.streamAsNdjson(emptySequence<String>(), output)

        assertThat(count, `is`(0L))
        assertThat(output.size(), `is`(0))
    }

    @Test
    fun `counts records identically whether or not it flushes per record`() {
        val flushed = ByteArrayOutputStream()
        val buffered = ByteArrayOutputStream()

        val flushedCount = streamer.streamAsNdjson(sequenceOf(1, 2, 3, 4), flushed, flushPerRecord = true)
        val bufferedCount = streamer.streamAsNdjson(sequenceOf(1, 2, 3, 4), buffered, flushPerRecord = false)

        assertThat(flushedCount, `is`(4L))
        assertThat(bufferedCount, `is`(4L))
        assertThat(buffered.toByteArray(), `is`(flushed.toByteArray()))
    }
}
