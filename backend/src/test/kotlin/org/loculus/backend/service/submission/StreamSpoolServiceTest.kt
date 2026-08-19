package org.loculus.backend.service.submission

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir
import org.loculus.backend.api.CompressionFormat
import org.loculus.backend.controller.ServiceUnavailableException
import org.loculus.backend.utils.IteratorStreamer
import java.io.File
import java.util.concurrent.TimeUnit

class StreamSpoolServiceTest {
    private val iteratorStreamer = IteratorStreamer(jacksonObjectMapper())
    private val services = mutableListOf<StreamSpoolService>()

    private fun serviceFor(dir: File, minFreeBytes: Long = 0, ttlMinutes: Long = 60) = StreamSpoolService(
        iteratorStreamer = iteratorStreamer,
        spoolDir = dir.absolutePath,
        maxConcurrentSpools = 4,
        maxTotalBytes = Long.MAX_VALUE,
        minFreeBytes = minFreeBytes,
        spoolFileTtlMinutes = ttlMinutes,
    ).also { services.add(it) }

    @AfterEach
    fun releaseDirectoryLocks() {
        services.forEach { it.releaseDirectoryLock() }
    }

    private fun spoolFilesIn(dir: File): List<File> =
        dir.listFiles { file -> file.name.startsWith(SPOOL_FILE_PREFIX) }?.toList().orEmpty()

    @Test
    fun `spool rejects with a 503 exception when free disk space is below the threshold`(@TempDir dir: File) {
        val service = serviceFor(dir, minFreeBytes = Long.MAX_VALUE)

        assertThrows<ServiceUnavailableException> {
            service.spool(CompressionFormat.ZSTD, endpoint = "get-released-data") { sequenceOf("a", "b") }
        }

        assertThat(spoolFilesIn(dir), `is`(emptyList()))
    }

    @Test
    fun `service rejects a spool path that is a file`(@TempDir dir: File) {
        val file = File(dir, "not-a-directory").apply { writeText("content") }

        assertThrows<IllegalStateException> { serviceFor(file) }
    }

    @Test
    fun `service removes old spool files from an explicit directory at startup`(@TempDir dir: File) {
        val oldSpool = File(dir, "${SPOOL_FILE_PREFIX}old.ndjson").apply { writeText("old") }
        val unrelated = File(dir, "unrelated.ndjson").apply { writeText("keep") }

        serviceFor(dir)

        assertThat(oldSpool.exists(), `is`(false))
        assertThat(unrelated.exists(), `is`(true))
    }

    @Test
    fun `explicit spool directory has one owner`(@TempDir dir: File) {
        val first = serviceFor(dir)

        assertThrows<IllegalStateException> { serviceFor(dir) }

        first.releaseDirectoryLock()
        serviceFor(dir)
    }

    @Test
    fun `sweepOrphanedSpoolFiles deletes stale spool files but keeps fresh and unrelated ones`(@TempDir dir: File) {
        val ttlMinutes = 60L
        val service = serviceFor(dir, ttlMinutes = ttlMinutes)
        val staleMillis = System.currentTimeMillis() - TimeUnit.MINUTES.toMillis(ttlMinutes * 2)

        val stale = File(dir, "${SPOOL_FILE_PREFIX}get-released-data-stale.ndjson").apply {
            writeText("stale")
            setLastModified(staleMillis)
        }
        val fresh = File(dir, "${SPOOL_FILE_PREFIX}get-released-data-fresh.ndjson").apply { writeText("fresh") }
        val unrelated = File(dir, "some-other-file.ndjson").apply {
            writeText("unrelated")
            setLastModified(staleMillis)
        }

        service.sweepOrphanedSpoolFiles()

        assertThat(stale.exists(), `is`(false))
        assertThat(fresh.exists(), `is`(true))
        assertThat(unrelated.exists(), `is`(true))
    }
}
