package org.loculus.backend.query.store

import com.github.luben.zstd.Zstd
import com.github.luben.zstd.ZstdDecompressCtx
import com.github.luben.zstd.ZstdDictDecompress
import java.util.concurrent.ConcurrentHashMap

/**
 * Shared, thread-safe cache of prepared zstd dictionaries (ZSTD_DDict is read-only once created, so it can be
 * used by many decompression contexts concurrently).
 */
class ZstdDictionaryCache(private val dictBytesById: (Int) -> ByteArray) {
    private val dicts = ConcurrentHashMap<Int, ZstdDictDecompress>()

    fun get(dictId: Int): ZstdDictDecompress = dicts.computeIfAbsent(dictId) { ZstdDictDecompress(dictBytesById(it)) }
}

/**
 * Decompresses raw zstd frames into a reusable buffer. NOT thread-safe: create one per stream / thread.
 * Keeps one decompression context per dictionary so that switching between sequences does not reload dicts.
 */
class SequenceDecompressor(private val dictionaries: ZstdDictionaryCache) : AutoCloseable {
    private val contexts = HashMap<Int, ZstdDecompressCtx>()
    private var noDictContext: ZstdDecompressCtx? = null

    /** the decompressed bytes of the last [decompress] call are buffer[0 until returned length] */
    var buffer: ByteArray = ByteArray(64 * 1024)
        private set

    fun decompress(dictId: Int?, frame: ByteArray): Int {
        val ctx = contextFor(dictId)
        val contentSize = Zstd.getFrameContentSize(frame)
        if (contentSize < 0) {
            // unknown content size (should not happen: frames are written with the content size)
            return decompressUnknownSize(ctx, frame)
        }
        if (contentSize > buffer.size) {
            buffer = ByteArray(maxOf(contentSize.toInt(), buffer.size * 2))
        }
        return ctx.decompressByteArray(buffer, 0, buffer.size, frame, 0, frame.size)
    }

    private fun decompressUnknownSize(ctx: ZstdDecompressCtx, frame: ByteArray): Int {
        while (true) {
            try {
                return ctx.decompressByteArray(buffer, 0, buffer.size, frame, 0, frame.size)
            } catch (e: com.github.luben.zstd.ZstdException) {
                if (buffer.size > MAX_BUFFER) throw e
                buffer = ByteArray(buffer.size * 4)
            }
        }
    }

    private fun contextFor(dictId: Int?): ZstdDecompressCtx {
        if (dictId == null) {
            return noDictContext ?: ZstdDecompressCtx().also { noDictContext = it }
        }
        return contexts.getOrPut(dictId) { ZstdDecompressCtx().loadDict(dictionaries.get(dictId)) }
    }

    override fun close() {
        contexts.values.forEach { it.close() }
        contexts.clear()
        noDictContext?.close()
        noDictContext = null
    }

    private companion object {
        const val MAX_BUFFER = 1 shl 30
    }
}
