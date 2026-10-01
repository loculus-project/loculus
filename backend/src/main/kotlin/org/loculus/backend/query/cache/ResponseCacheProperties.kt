package org.loculus.backend.query.cache

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.util.unit.DataSize

/**
 * loculus.query-engine.cache.memory-size            heap budget of the memory tier (0 = off)
 * loculus.query-engine.cache.memory-max-entry-size  largest response kept in memory (default: memory-size / 16);
 *                                                   larger ones go to the disk tier
 * loculus.query-engine.cache.disk-size              budget of the disk tier (0 = off)
 * loculus.query-engine.cache.disk-max-entry-size    largest response kept on disk (default: disk-size / 8)
 * loculus.query-engine.cache.disk-path              directory of the disk tier (wiped at startup; required for it)
 * loculus.query-engine.cache.admit-after-sightings  a response is cached from this sighting of its request on
 * loculus.query-engine.cache.max-concurrent-disk-tees
 *                                                   streamed responses written to a temp file at the same time; the
 *                                                   disk needs room for disk-size + this × disk-max-entry-size
 * loculus.query-engine.cache.single-flight-wait-ms  how long an identical concurrent request waits for the first one
 * loculus.query-engine.cache.db-row-cost-ms         ms of engine time one Postgres row read is worth, when ranking
 * loculus.query-engine.cache.db-megabyte-cost-ms    ms of engine time one MB read from Postgres is worth
 *                                                   (entry cost = engine ms + rows × row cost + MB × MB cost)
 * loculus.query-engine.cache.stale-grace-ms         entries of an organism's superseded content token are purged this
 *                                                   long after the new token was first seen
 * loculus.query-engine.cache.max-age-ms             entries older than this are purged regardless
 * loculus.query-engine.cache.sweep-interval-ms      how often the purges run
 */
@ConfigurationProperties(prefix = "loculus.query-engine.cache")
data class ResponseCacheProperties(
    val memorySize: DataSize = DataSize.ofMegabytes(64),
    val memoryMaxEntrySize: DataSize? = null,
    val diskSize: DataSize = DataSize.ofBytes(0),
    val diskMaxEntrySize: DataSize? = null,
    val diskPath: String? = null,
    val admitAfterSightings: Int = 2,
    val sketchCounters: Int = 1 shl 18,
    val maxConcurrentDiskTees: Int = 2,
    val singleFlightWaitMs: Long = 10_000,
    val dbRowCostMs: Double = 0.02,
    val dbMegabyteCostMs: Double = 1.0,
    val staleGraceMs: Long = 120_000,
    val maxAgeMs: Long = 24 * 3_600_000L,
    val sweepIntervalMs: Long = 15_000,
) {
    val memoryBudget get() = memorySize.toBytes().coerceAtLeast(0)
    val memoryMaxEntry get() = memoryMaxEntrySize?.toBytes() ?: (memoryBudget / 16)
    val diskBudget get() = if (diskPath.isNullOrBlank()) 0 else diskSize.toBytes().coerceAtLeast(0)
    val diskMaxEntry get() = diskMaxEntrySize?.toBytes() ?: (diskBudget / 8)
}
