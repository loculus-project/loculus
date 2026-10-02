package org.loculus.backend.service.files

import mu.KotlinLogging
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.loculus.backend.utils.FILE_ID_PREFIX
import org.loculus.backend.utils.FILE_ID_SEQUENCE_NAME
import org.loculus.backend.utils.fileIdSerial
import org.loculus.backend.utils.fileIdToSequenceNumber
import org.loculus.backend.utils.generateFileId
import org.loculus.backend.utils.getNextSequenceNumbers
import org.springframework.stereotype.Service

private val log = KotlinLogging.logger {}

private const val MAX_ALLOCATION_ROUNDS = 10
private const val MAX_SEQUENCE_NUMBERS_SKIPPED_PER_QUERY = 100_000

/**
 * Issues file IDs from the file ID sequence, skipping IDs whose S3 object already exists.
 *
 * Such objects are left over when the database was reset but the bucket was not: the sequence restarts and would
 * reissue taken keys, whose create-only presigned uploads then fail with 412. The sequence never issues an ID twice,
 * so any stored object for a freshly drawn ID is such a leftover, and the leftovers form one block of low IDs.
 *
 * Keys sort in sequence order (fixed-width base34 serial, valid below 34^6 ≈ 1.5e9), so one ListObjectsV2 starting at
 * the lowest drawn ID shows every collision in a batch; normally it returns nothing at or above that ID. After a
 * collision the sequence is advanced past the highest stored ID, so the block is scanned once rather than per request.
 */
@Service
class FileIdAllocator(private val s3Service: S3Service) {

    fun allocate(count: Int): List<FileId> {
        val issued = mutableListOf<Long>()
        repeat(MAX_ALLOCATION_ROUNDS) {
            val candidates = getNextSequenceNumbers(FILE_ID_SEQUENCE_NAME, count - issued.size).toSortedSet()
            val stored = storedSequenceNumbersFrom(candidates.first()).iterator()

            val taken = mutableSetOf<Long>()
            var highestStored = candidates.first()
            while (stored.hasNext()) {
                val sequenceNumber = stored.next()
                if (sequenceNumber > candidates.last() && taken.isEmpty()) {
                    break
                }
                if (sequenceNumber in candidates) {
                    taken += sequenceNumber
                }
                highestStored = sequenceNumber
            }

            issued += candidates - taken
            if (taken.isEmpty()) {
                return issued.map(::generateFileId)
            }

            log.warn {
                "Skipped ${taken.size} file IDs that already exist in S3; advancing $FILE_ID_SEQUENCE_NAME past " +
                    "${generateFileId(highestStored)}, the highest stored file ID"
            }
            advanceSequenceTo(highestStored)
        }
        throw IllegalStateException("Could not allocate $count unused file IDs in $MAX_ALLOCATION_ROUNDS rounds")
    }

    private fun storedSequenceNumbersFrom(sequenceNumber: Long): Sequence<Long> = s3Service
        // the serial without its check character sorts directly before the file ID itself
        .listStoredFileIds(prefix = FILE_ID_PREFIX, startAfter = FILE_ID_PREFIX + fileIdSerial(sequenceNumber))
        .mapNotNull(::fileIdToSequenceNumber)

    /**
     * Draws and discards sequence numbers until the sequence has reached [target]. Unlike `setval`, this cannot move
     * the sequence backwards when other requests draw from it concurrently.
     */
    private fun advanceSequenceTo(target: Long) {
        val current = transaction {
            exec("SELECT last_value FROM $FILE_ID_SEQUENCE_NAME") { rs ->
                rs.next()
                rs.getLong(1)
            }
        } ?: throw IllegalStateException("Could not read $FILE_ID_SEQUENCE_NAME")
        var remaining = target - current
        while (remaining > 0) {
            val batch = minOf(remaining, MAX_SEQUENCE_NUMBERS_SKIPPED_PER_QUERY.toLong()).toInt()
            getNextSequenceNumbers(FILE_ID_SEQUENCE_NAME, batch)
            remaining -= batch
        }
    }
}
