package org.loculus.backend.query.projection

import com.github.luben.zstd.Zstd
import com.github.luben.zstd.ZstdDecompressCtx
import com.github.luben.zstd.ZstdDictDecompress
import java.util.concurrent.ConcurrentHashMap

/**
 * Decompresses stored zstd frames (optionally compressed with a dictionary from compression_dictionaries_table)
 * into a reusable per-thread buffer. Thread-safe; each thread keeps one decompression context per dictionary.
 *
 * @param dictProvider returns the raw dictionary bytes for a dictionary id
 */
class SequenceDecompressor(private val dictProvider: (Int) -> ByteArray) {
    private val digestedDicts = ConcurrentHashMap<Int, ZstdDictDecompress>()

    private class ThreadState {
        val contexts = HashMap<Int, ZstdDecompressCtx>()
        var buffer = ByteArray(64 * 1024)
    }

    private val threadState = ThreadLocal.withInitial { ThreadState() }

    private fun context(state: ThreadState, dictId: Int?): ZstdDecompressCtx {
        val key = dictId ?: -1
        return state.contexts.getOrPut(key) {
            ZstdDecompressCtx().also { ctx ->
                if (dictId != null) {
                    ctx.loadDict(digestedDicts.computeIfAbsent(dictId) { ZstdDictDecompress(dictProvider(it)) })
                }
            }
        }
    }

    /**
     * Decompresses [frame] and calls [consumer] with a buffer holding the decompressed bytes in `[0, length)`.
     * The buffer is only valid during the call.
     */
    fun <T> decompress(frame: ByteArray, dictId: Int?, consumer: (buffer: ByteArray, length: Int) -> T): T {
        val state = threadState.get()
        val contentSize = Zstd.getFrameContentSize(frame)
        if (contentSize < 0 || Zstd.isError(contentSize)) {
            throw IllegalStateException("Cannot read zstd frame content size (code $contentSize)")
        }
        if (state.buffer.size < contentSize) {
            state.buffer = ByteArray(maxOf(contentSize.toInt(), state.buffer.size * 2))
        }
        val length = context(state, dictId).decompressByteArray(
            state.buffer,
            0,
            state.buffer.size,
            frame,
            0,
            frame.size,
        )
        return consumer(state.buffer, length)
    }
}
