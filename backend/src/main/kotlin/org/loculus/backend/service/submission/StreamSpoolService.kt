package org.loculus.backend.service.submission

import jakarta.annotation.PreDestroy
import mu.KotlinLogging
import org.apache.commons.compress.compressors.zstandard.ZstdCompressorOutputStream
import org.jetbrains.exposed.sql.transactions.transaction
import org.loculus.backend.api.CompressionFormat
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.ServiceUnavailableException
import org.loculus.backend.utils.IteratorStreamer
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import java.io.File
import java.io.FilterOutputStream
import java.io.OutputStream
import java.nio.channels.FileChannel
import java.nio.channels.FileLock
import java.nio.channels.OverlappingFileLockException
import java.nio.file.StandardOpenOption
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

private val log = KotlinLogging.logger { }

const val SPOOL_FILE_PREFIX = "loculus-stream-"
const val SPOOL_RETRY_AFTER_SECONDS = 30L
private const val SPOOL_LOCK_FILE_NAME = ".loculus-spool.lock"
private const val SPOOL_PROBE_FILE_PREFIX = ".loculus-spool-probe-"
private enum class SpoolState { READY, TRANSFERRING, CLOSED }

class SpooledStream internal constructor(val file: File, val recordCount: Long, private val release: () -> Unit) :
    AutoCloseable {
    private val state = AtomicReference(SpoolState.READY)

    internal fun beginTransfer(): Boolean = state.compareAndSet(SpoolState.READY, SpoolState.TRANSFERRING)

    internal fun closeIfTransferNotStarted() {
        if (state.compareAndSet(SpoolState.READY, SpoolState.CLOSED)) {
            release()
        }
    }

    override fun close() {
        if (state.getAndSet(SpoolState.CLOSED) != SpoolState.CLOSED) {
            release()
        }
    }
}

/** Writes a database result to a temporary file and counts its records. */
@Service
class StreamSpoolService(
    private val iteratorStreamer: IteratorStreamer,
    @Value("\${${BackendSpringProperty.STREAM_SPOOL_DIR}:}") spoolDir: String,
    @Value("\${${BackendSpringProperty.STREAM_MAX_CONCURRENT_SPOOLS}:4}") maxConcurrentSpools: Int,
    @Value("\${${BackendSpringProperty.STREAM_SPOOL_MAX_TOTAL_BYTES}:19327352832}") maxTotalBytes: Long,
    @Value("\${${BackendSpringProperty.STREAM_SPOOL_MIN_FREE_BYTES}:1073741824}") minFreeBytes: Long,
    @Value("\${${BackendSpringProperty.STREAM_SPOOL_FILE_TTL_MINUTES}:180}") private val spoolFileTtlMinutes: Long,
) {
    private val usesDefaultTempDirectory = spoolDir.isBlank()
    private val spoolDirectory = File(spoolDir.ifBlank { System.getProperty("java.io.tmpdir") })
    private val minFreeBytes = minFreeBytes.coerceAtLeast(0)
    private val maxTotalBytes = maxTotalBytes.coerceAtLeast(1)
    private val semaphore = Semaphore(maxConcurrentSpools.coerceAtLeast(1))
    private val activeFiles = ConcurrentHashMap.newKeySet<File>()
    private val diskWriteLock = Any()
    private val trackedFileSizes = mutableMapOf<File, Long>()
    private var trackedBytes = 0L
    private var directoryLockChannel: FileChannel? = null
    private var directoryLock: FileLock? = null

    init {
        validateSpoolDirectory()
        try {
            if (usesDefaultTempDirectory) {
                trackExistingFiles()
            } else {
                acquireDirectoryLock()
                removeExistingFiles()
            }
        } catch (error: Throwable) {
            releaseDirectoryLock()
            throw error
        }
    }

    fun <T> spool(
        compressionFormat: CompressionFormat?,
        endpoint: String,
        sequenceProvider: () -> Sequence<T>,
    ): SpooledStream {
        if (!semaphore.tryAcquire()) {
            throw unavailable("The server is preparing the maximum number of exports. Please retry later.")
        }

        val startTime = System.currentTimeMillis()
        var tempFile: File? = null
        try {
            ensureFreeSpace()
            val file = File.createTempFile("$SPOOL_FILE_PREFIX$endpoint-", ".ndjson", spoolDirectory)
            tempFile = file
            activeFiles.add(file)
            synchronized(diskWriteLock) {
                trackedFileSizes[file] = 0
            }

            val recordCount = transaction {
                openOutputStream(file, compressionFormat).use { stream ->
                    iteratorStreamer.streamAsNdjson(sequenceProvider(), stream, flushPerRecord = false)
                }
            }

            log.info {
                "[$endpoint] Spooled $recordCount records (${file.length()} bytes on disk) " +
                    "in ${System.currentTimeMillis() - startTime}ms"
            }
            return SpooledStream(file, recordCount) {
                discard(file, endpoint)
            }
        } catch (error: Throwable) {
            tempFile?.let { discard(it, endpoint) }
            log.error(error) {
                "[$endpoint] Failed to spool response after ${System.currentTimeMillis() - startTime}ms: $error"
            }
            throw error
        } finally {
            semaphore.release()
        }
    }

    private fun openOutputStream(file: File, compressionFormat: CompressionFormat?): OutputStream {
        val fileStream = synchronized(diskWriteLock) {
            val output = file.outputStream()
            trackedBytes -= trackedFileSizes.put(file, 0) ?: 0
            output
        }
        val checkedFileStream = FreeSpaceCheckingOutputStream(
            fileStream,
        ) { bytes, write -> write(file, bytes, write) }.buffered()
        return when (compressionFormat) {
            CompressionFormat.ZSTD -> ZstdCompressorOutputStream(checkedFileStream)
            null -> checkedFileStream
        }
    }

    private fun write(file: File, bytes: Int, write: () -> Unit) {
        synchronized(diskWriteLock) {
            ensureFreeSpace(bytes)
            val requestedBytes = bytes.toLong()
            if (requestedBytes > maxTotalBytes - trackedBytes) {
                throw unavailable("The server does not have enough spool capacity. Please retry later.")
            }

            trackedBytes += requestedBytes
            trackedFileSizes[file] = trackedFileSizes.getValue(file) + requestedBytes
            write()
        }
    }

    private fun ensureFreeSpace(bytesToWrite: Int = 0) {
        val usable = spoolDirectory.usableSpace
        val doesNotLeaveMinimum = usable <= minFreeBytes || bytesToWrite.toLong() > usable - minFreeBytes
        if (usable == 0L || doesNotLeaveMinimum) {
            throw unavailable("The server does not have enough free disk space. Please retry later.")
        }
    }

    private fun validateSpoolDirectory() {
        check(spoolDirectory.isDirectory || spoolDirectory.mkdirs()) {
            "Cannot create spool directory ${spoolDirectory.absolutePath}"
        }
        val probe = try {
            File.createTempFile(SPOOL_PROBE_FILE_PREFIX, ".tmp", spoolDirectory)
        } catch (error: Exception) {
            throw IllegalStateException("Cannot write to spool directory ${spoolDirectory.absolutePath}", error)
        }
        check(probe.delete()) {
            "Cannot delete files from spool directory ${spoolDirectory.absolutePath}"
        }
    }

    private fun acquireDirectoryLock() {
        val channel = FileChannel.open(
            File(spoolDirectory, SPOOL_LOCK_FILE_NAME).toPath(),
            StandardOpenOption.CREATE,
            StandardOpenOption.WRITE,
        )
        try {
            val lock = try {
                channel.tryLock()
            } catch (_: OverlappingFileLockException) {
                null
            }
            check(lock != null) {
                "Spool directory is already used by another process: ${spoolDirectory.absolutePath}"
            }
            directoryLockChannel = channel
            directoryLock = lock
        } catch (error: Throwable) {
            channel.close()
            throw error
        }
    }

    @PreDestroy
    internal fun releaseDirectoryLock() {
        try {
            directoryLock?.release()
        } catch (error: Exception) {
            log.warn(error) { "Failed to release spool directory lock" }
        } finally {
            directoryLock = null
            try {
                directoryLockChannel?.close()
            } catch (error: Exception) {
                log.warn(error) { "Failed to close spool directory lock" }
            } finally {
                directoryLockChannel = null
            }
        }
    }

    private fun trackExistingFiles() {
        val existingFiles = spoolDirectory.listFiles { file ->
            file.isFile && file.name.startsWith(SPOOL_FILE_PREFIX)
        }.orEmpty()
        synchronized(diskWriteLock) {
            existingFiles.forEach { file -> trackedFileSizes[file] = file.length() }
            trackedBytes = trackedFileSizes.values.sum()
        }
    }

    private fun removeExistingFiles() {
        val existingFiles = spoolDirectory.listFiles { file ->
            file.isFile && file.name.startsWith(SPOOL_FILE_PREFIX)
        }.orEmpty()
        existingFiles.forEach { file ->
            check(file.delete() || !file.exists()) {
                "Cannot remove spool file ${file.absolutePath}"
            }
        }
    }

    private fun discard(file: File, endpoint: String) {
        activeFiles.remove(file)
        if (file.delete() || !file.exists()) {
            synchronized(diskWriteLock) {
                trackedBytes -= trackedFileSizes.remove(file) ?: 0
            }
        } else {
            log.warn { "[$endpoint] Failed to delete spool file ${file.absolutePath}" }
        }
    }

    private fun unavailable(message: String) = ServiceUnavailableException(message, SPOOL_RETRY_AFTER_SECONDS)

    @Scheduled(
        initialDelay = 10,
        fixedRateString = "\${${BackendSpringProperty.STREAM_SPOOL_SWEEP_EVERY_MINUTES}:30}",
        timeUnit = TimeUnit.MINUTES,
    )
    fun sweepOrphanedSpoolFiles() {
        val cutoff = System.currentTimeMillis() - TimeUnit.MINUTES.toMillis(spoolFileTtlMinutes)
        val orphans = spoolDirectory.listFiles { file ->
            file.isFile &&
                file.name.startsWith(SPOOL_FILE_PREFIX) &&
                file !in activeFiles &&
                file.lastModified() < cutoff
        } ?: return
        val deleted = orphans.count { file ->
            if (!file.delete()) {
                false
            } else {
                synchronized(diskWriteLock) {
                    trackedBytes -= trackedFileSizes.remove(file) ?: 0
                }
                true
            }
        }
        if (deleted > 0) {
            log.info { "Swept $deleted orphaned spool files from $spoolDirectory" }
        }
    }
}

private class FreeSpaceCheckingOutputStream(
    outputStream: OutputStream,
    private val checkedWrite: (Int, () -> Unit) -> Unit,
) : FilterOutputStream(outputStream) {
    override fun write(byte: Int) {
        checkedWrite(1) { out.write(byte) }
    }

    override fun write(bytes: ByteArray, offset: Int, length: Int) {
        checkedWrite(length) { out.write(bytes, offset, length) }
    }
}
