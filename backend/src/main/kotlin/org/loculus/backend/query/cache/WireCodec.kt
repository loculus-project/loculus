package org.loculus.backend.query.cache

import com.aayushatharva.brotli4j.Brotli4jLoader
import com.aayushatharva.brotli4j.encoder.BrotliOutputStream
import com.aayushatharva.brotli4j.encoder.Encoder
import com.github.luben.zstd.ZstdOutputStream
import java.io.ByteArrayOutputStream
import java.io.FilterOutputStream
import java.io.OutputStream
import java.util.concurrent.Semaphore
import java.util.zip.CRC32
import java.util.zip.Deflater
import java.util.zip.GZIPOutputStream

/** how the bytes of a response are encoded on the wire (Content-Encoding, or the `compression` parameter) */
enum class WireCodec {
    IDENTITY,
    GZIP,
    ZSTD,
    BR,
    ;

    /** a complete stream (what the controller's own compressors produce) */
    fun encoder(out: OutputStream): OutputStream = when (this) {
        IDENTITY -> out
        GZIP -> gzipOutputStream(out, BUFFER_SIZE)
        ZSTD -> zstdOutputStream(out)
        BR -> brotliOutputStream(out)
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
     * - br: a stream ending in a flush (byte-aligned, not final); [tail] appends uncompressed meta-blocks and an empty
     *   last meta-block (RFC 7932 §9.2), which need no encoder state.
     */
    fun encodePrefix(plain: ByteArray, offset: Int, length: Int): ByteArray = when (this) {
        IDENTITY -> plain.copyOfRange(offset, offset + length)

        ZSTD -> encodeWhole(plain, offset, length)

        BR -> {
            val out = ByteArrayOutputStream(length / 8 + 64)
            val brotli = brotliOutputStream(out)
            val flushed = try {
                brotli.write(plain, offset, length)
                brotli.flush()
                out.toByteArray()
            } finally {
                // frees the native encoder; the final bytes it appends are not part of the prefix
                brotli.close()
            }
            flushed
        }

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

        BR -> {
            val out = ByteArrayOutputStream(rest.size + rest.size / BROTLI_UNCOMPRESSED_BLOCK * 3 + 4)
            var at = 0
            while (at < rest.size) {
                val n = minOf(BROTLI_UNCOMPRESSED_BLOCK, rest.size - at)
                // ISLAST=0, MNIBBLES=4 (code 0), MLEN-1 in 16 bits, ISUNCOMPRESSED=1, zero padding to the byte boundary
                val header = ((n - 1) shl 3) or (1 shl 19)
                out.write(header and 0xff)
                out.write((header shr 8) and 0xff)
                out.write((header shr 16) and 0xff)
                out.write(rest, at, n)
                at += n
            }
            // ISLAST=1, ISLASTEMPTY=1
            out.write(0x03)
            out.toByteArray()
        }

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

        /** level 1: ~16x faster than the default 6 on sequence data for ~14 % more bytes; gzip is CPU-bound here */
        const val GZIP_LEVEL = Deflater.BEST_SPEED

        /**
         * Long-distance matching within an 8 MB window: sequences of one organism repeat far apart (SARS-CoV-2: ~1.6x
         * smaller at ~800 MB/s per thread). 8 MB is the most RFC 9659 allows for `Content-Encoding: zstd`, which browsers
         * enforce, and it bounds the native memory of each concurrent stream.
         */
        const val ZSTD_WINDOW_LOG = 23

        fun zstdOutputStream(out: OutputStream): OutputStream =
            ZstdOutputStream(out, ZSTD_LEVEL).apply { setLong(ZSTD_WINDOW_LOG) }

        /**
         * Explicit `compression=zstd` downloads are decoded by the zstd CLI or a library, not a browser, so they may
         * use a 128 MB window (the CLI's default decoding limit): 3.6-5x smaller than 8 MB on SARS-CoV-2 and mpox.
         * Each such stream holds ~140 MB of native memory, so at most [MAX_LARGE_WINDOW_STREAMS] run at once; further
         * downloads get the 8 MB window instead of waiting.
         */
        const val ZSTD_DOWNLOAD_WINDOW_LOG = 27
        const val MAX_LARGE_WINDOW_STREAMS = 8
        private val largeWindowPermits = Semaphore(MAX_LARGE_WINDOW_STREAMS)

        internal val largeWindowStreamsAvailable get() = largeWindowPermits.availablePermits()

        fun zstdDownloadOutputStream(out: OutputStream): OutputStream {
            if (!largeWindowPermits.tryAcquire()) return zstdOutputStream(out)
            val zstd = try {
                ZstdOutputStream(out, ZSTD_LEVEL).apply { setLong(ZSTD_DOWNLOAD_WINDOW_LOG) }
            } catch (e: Throwable) {
                largeWindowPermits.release()
                throw e
            }
            return object : FilterOutputStream(zstd) {
                private var released = false

                override fun write(b: ByteArray, off: Int, len: Int) = zstd.write(b, off, len)

                override fun close() {
                    try {
                        zstd.close()
                    } finally {
                        if (!released) {
                            released = true
                            largeWindowPermits.release()
                        }
                    }
                }
            }
        }

        /**
         * Quality 4 with a 16 MB window (the most RFC 7932 decoders must accept): on SARS-CoV-2 and mpox FASTA ~25x
         * smaller than gzip-1 and ~5x faster (~900 MB/s per thread), close to zstd with long matching. For clients
         * that accept br but not zstd.
         */
        const val BROTLI_QUALITY = 4
        const val BROTLI_WINDOW_LOG = 24
        private const val BROTLI_UNCOMPRESSED_BLOCK = 1 shl 16

        /** false if the native library cannot be loaded; br is then never negotiated */
        val brotliAvailable: Boolean by lazy { Brotli4jLoader.isAvailable() }

        private val brotliParameters by lazy {
            Brotli4jLoader.ensureAvailability()
            Encoder.Parameters().setQuality(BROTLI_QUALITY).setWindow(BROTLI_WINDOW_LOG)
        }

        fun brotliOutputStream(out: OutputStream): OutputStream = BrotliOutputStream(out, brotliParameters, BUFFER_SIZE)

        fun gzipOutputStream(out: OutputStream, bufferSize: Int): OutputStream =
            object : GZIPOutputStream(out, bufferSize) {
                init {
                    def.setLevel(GZIP_LEVEL)
                }
            }
        private const val BUFFER_SIZE = 64 * 1024

        // magic, deflate, no flags, no mtime, no extra flags, OS unknown (like java.util.zip.GZIPOutputStream)
        private val GZIP_HEADER = byteArrayOf(0x1f, 0x8b.toByte(), 8, 0, 0, 0, 0, 0, 0, 0)

        fun of(contentEncodingOrCompression: String?): WireCodec = when (contentEncodingOrCompression?.lowercase()) {
            null -> IDENTITY
            "gzip" -> GZIP
            "zstd" -> ZSTD
            "br" -> BR
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
            val deflater = Deflater(GZIP_LEVEL, true)
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
