package org.loculus.backend.query.cache

import java.nio.file.Path

/**
 * What a cached response needs besides its body bytes: the headers of the miss that produced it (without ETag and
 * Lapis-Data-Version, which are set per request) and how the body ends.
 *
 * [splice] is null when the stored body is the complete wire representation. Otherwise the stored body is the
 * encoded part before the JSON envelope's `info` object ([WireCodec.encodePrefix]), and each response appends a
 * fresh `info` plus [InfoSplice.suffix] with [WireCodec.tail], so that requestId and requestInfo are never replayed.
 */
class CachedResponse(
    val headers: List<Pair<String, String>>,
    val codec: WireCodec,
    val splice: InfoSplice?,
    /** length of the stored (encoded) body, which is also its length on the wire before any tail */
    val bodyLength: Long,
)

class InfoSplice(val suffix: ByteArray, val prefixCrc: Int, val prefixLength: Long)

/** where a cached body is */
sealed interface Payload {
    class Memory(val bytes: ByteArray) : Payload

    /** a published file; identity-encoded bodies are stored zstd-compressed ([zstd]) */
    class Disk(val path: Path, val fileLength: Long, val zstd: Boolean) : Payload
}

/** key of one representation: organism, index content token, hash of the parsed request and its encoding */
data class CacheKey(val organism: String, val contentToken: String, val requestHash: String) {
    val id = "$organism/$contentToken/$requestHash"

    /** popularity survives new content tokens: the default search table stays hot across data versions */
    val popularityId = "$organism/$requestHash"
}

/**
 * What the miss that produced a response cost: engine time (execute + render, or the whole stream) and the rows and
 * (decoded) bytes it read from Postgres through the QueryStore. Each hit saves this again.
 */
data class MissCost(val engineMs: Double, val dbRows: Long = 0, val dbBytes: Long = 0) {
    /** the cost that ranks entries: engine time plus the configured ms-equivalents of the database work */
    fun weighted(rowMs: Double, megabyteMs: Double) = engineMs + dbRows * rowMs + dbBytes / 1e6 * megabyteMs
}
