package org.loculus.backend.query.cache

import com.github.luben.zstd.ZstdInputStream
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import java.util.zip.CRC32
import java.util.zip.GZIPInputStream
import kotlin.random.Random

class WireCodecTest {
    private fun decode(codec: WireCodec, bytes: ByteArray): ByteArray = when (codec) {
        WireCodec.IDENTITY -> bytes
        WireCodec.GZIP -> GZIPInputStream(bytes.inputStream()).use { it.readAllBytes() }
        WireCodec.ZSTD -> ZstdInputStream(bytes.inputStream()).use { it.readAllBytes() }
    }

    @Test
    fun `crc32Combine equals the CRC of the concatenation`() {
        val random = Random(1)
        repeat(50) {
            val a = random.nextBytes(random.nextInt(0, 5000))
            val b = random.nextBytes(random.nextInt(0, 5000))
            val crcA = CRC32().apply { update(a) }.value
            val crcB = CRC32().apply { update(b) }.value
            assertThat(
                WireCodec.crc32Combine(crcA, crcB, b.size.toLong()),
                equalTo(CRC32().apply { update(a + b) }.value),
            )
        }
    }

    @Test
    fun `a spliced body decodes to prefix plus tail, in every codec`() {
        val json = (1..3000).joinToString(",", "{\"data\":[", "]") { """{"id":$it,"country":"CH"}""" }.toByteArray()
        for (codec in WireCodec.entries) {
            for (prefix in listOf(json, ByteArray(0), json.copyOf(100_000.coerceAtMost(json.size)))) {
                val rest = ""","info":{"requestId":"x"}}""".toByteArray()
                val encoded = codec.encodePrefix(prefix, 0, prefix.size) +
                    codec.tail(rest, WireCodec.crc32(prefix, 0, prefix.size), prefix.size.toLong())
                assertThat("$codec", decode(codec, encoded).toList(), equalTo((prefix + rest).toList()))
            }
            assertThat(decode(codec, codec.encodeWhole(json)).toList(), equalTo(json.toList()))
        }
    }

    @Test
    fun `a stored gzip prefix is reused with different tails`() {
        val prefix = "x".repeat(70_000).toByteArray()
        val encoded = WireCodec.GZIP.encodePrefix(prefix, 0, prefix.size)
        for (tail in listOf("a", "bb", "")) {
            val body =
                encoded + WireCodec.GZIP.tail(tail.toByteArray(), WireCodec.crc32(prefix, 0, prefix.size), 70_000)
            assertThat(String(decode(WireCodec.GZIP, body)), equalTo("x".repeat(70_000) + tail))
        }
    }
}
