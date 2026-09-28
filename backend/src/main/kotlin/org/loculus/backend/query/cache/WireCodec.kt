package org.loculus.backend.query.cache

import com.github.luben.zstd.ZstdOutputStream
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.util.zip.CRC32
import java.util.zip.Deflater
import java.util.zip.GZIPOutputStream

/** how the bytes of a response are encoded on the wire (Content-Encoding, or the `compression` parameter) */
enum class WireCodec {
    IDENTITY,
    GZIP,
    ZSTD,
    ;

    /** a complete stream (what the controller's own compressors produce) */
    fun encoder(out: OutputStream): OutputStream = when (this) {
        IDENTITY -> out
        GZIP -> GZIPOutputStream(out, BUFFER_SIZE)
        ZSTD -> ZstdOutputStream(out, ZSTD_LEVEL)
    }

    fun encodeWhole(plain: ByteArray, offset: Int = 0, length: Int = plain.size - offset): ByteArray {
        val out = ByteArrayOutputStream(if (this == IDENTITY) length else length / 4 + 64)
        encoder(out).use { it.write(plain, offset, length) }
        return out.toByteArray()
    }

    /**
     * Encodes the part of a body before its per-request `info` object, so that [tail] can finish the stream with a
     * fresh one without re-encoding the prefix:
     * - gzip: header + raw deflate ending in a sync flush (byte-aligned, not final); [tail] appends the final
     *   deflate blocks from a fresh deflater (which references nothing before them) and the trailer, whose CRC is
     *   combined from the prefix CRC. One valid gzip member.
     * - zstd: one complete frame; [tail] appends a second frame (RFC 8878 §3.1: a stream is a sequence of frames).
     */
    fun encodePrefix(plain: ByteArray, offset: Int, length: Int): ByteArray = when (this) {
        IDENTITY -> plain.copyOfRange(offset, offset + length)

        ZSTD -> encodeWhole(plain, offset, length)

        GZIP -> {
            val out = ByteArrayOutputStream(length / 4 + 64)
            out.write(GZIP_HEADER)
            deflate(out, plain, offset, length, Deflater.SYNC_FLUSH)
            out.toByteArray()
        }
    }

    /** the encoded rest of a body whose prefix was encoded by [encodePrefix] */
    fun tail(rest: ByteArray, prefixCrc: Int, prefixLength: Long): ByteArray = when (this) {
        IDENTITY -> rest

        ZSTD -> encodeWhole(rest)

        GZIP -> {
            val out = ByteArrayOutputStream(rest.size + 32)
            deflate(out, rest, 0, rest.size, Deflater.FULL_FLUSH, finish = true)
            val crc = CRC32().apply { update(rest) }.value
            val combined = crc32Combine(prefixCrc.toLong() and 0xffffffffL, crc, rest.size.toLong())
            writeIntLe(out, combined.toInt())
            writeIntLe(out, (prefixLength + rest.size).toInt())
            out.toByteArray()
        }
    }

    companion object {
        const val ZSTD_LEVEL = 3
        private const val BUFFER_SIZE = 64 * 1024

        // magic, deflate, no flags, no mtime, no extra flags, OS unknown (like java.util.zip.GZIPOutputStream)
        private val GZIP_HEADER = byteArrayOf(0x1f, 0x8b.toByte(), 8, 0, 0, 0, 0, 0, 0, 0)

        fun of(contentEncodingOrCompression: String?): WireCodec = when (contentEncodingOrCompression?.lowercase()) {
            null -> IDENTITY
            "gzip" -> GZIP
            "zstd" -> ZSTD
            else -> error("unknown codec $contentEncodingOrCompression")
        }

        fun crc32(plain: ByteArray, offset: Int, length: Int): Int =
            CRC32().apply { update(plain, offset, length) }.value.toInt()

        private fun deflate(
            out: ByteArrayOutputStream,
            input: ByteArray,
            offset: Int,
            length: Int,
            flush: Int,
            finish: Boolean = false,
        ) {
            val deflater = Deflater(Deflater.DEFAULT_COMPRESSION, true)
            try {
                deflater.setInput(input, offset, length)
                if (finish) deflater.finish()
                val buffer = ByteArray(BUFFER_SIZE)
                while (true) {
                    val n = deflater.deflate(buffer, 0, buffer.size, if (finish) Deflater.NO_FLUSH else flush)
                    out.write(buffer, 0, n)
                    if (finish) {
                        if (deflater.finished()) break
                    } else if (n < buffer.size && deflater.needsInput()) {
                        break
                    }
                }
            } finally {
                deflater.end()
            }
        }

        private fun writeIntLe(out: OutputStream, v: Int) {
            out.write(v and 0xff)
            out.write((v ushr 8) and 0xff)
            out.write((v ushr 16) and 0xff)
            out.write((v ushr 24) and 0xff)
        }

        /** CRC-32 of A+B from crc(A), crc(B) and len(B) (zlib's crc32_combine) */
        fun crc32Combine(crc1: Long, crc2: Long, len2: Long): Long {
            if (len2 <= 0) return crc1
            val even = LongArray(32)
            val odd = LongArray(32)
            odd[0] = 0xedb88320L
            var row = 1L
            for (n in 1 until 32) {
                odd[n] = row
                row = row shl 1
            }
            gf2Square(even, odd)
            gf2Square(odd, even)
            var c = crc1
            var len = len2
            while (true) {
                gf2Square(even, odd)
                if (len and 1L != 0L) c = gf2Times(even, c)
                len = len shr 1
                if (len == 0L) break
                gf2Square(odd, even)
                if (len and 1L != 0L) c = gf2Times(odd, c)
                len = len shr 1
                if (len == 0L) break
            }
            return (c xor crc2) and 0xffffffffL
        }

        private fun gf2Times(mat: LongArray, vec: Long): Long {
            var v = vec
            var sum = 0L
            var i = 0
            while (v != 0L) {
                if (v and 1L != 0L) sum = sum xor mat[i]
                v = v ushr 1
                i++
            }
            return sum
        }

        private fun gf2Square(square: LongArray, mat: LongArray) {
            for (n in 0 until 32) square[n] = gf2Times(mat, mat[n])
        }
    }
}
