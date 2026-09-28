package org.loculus.backend.service.submission

import kotlinx.datetime.toLocalDateTime
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.greater
import org.jetbrains.exposed.v1.core.greaterEq
import org.jetbrains.exposed.v1.jdbc.select
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.TooManyRequestsException
import org.loculus.backend.model.UploadType
import org.loculus.backend.service.files.FilesTable
import org.loculus.backend.utils.DateProvider
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import kotlin.time.Duration.Companion.hours

private val LIMIT_WINDOW = 24.hours

/**
 * Enforces [org.loculus.backend.config.SubmissionLimits] by counting what was created in the last 24h.
 * Counts are taken from existing rows, so deleted unreleased entries and garbage-collected files free up quota.
 * Concurrent requests are not serialized, so the cap can be overshot by the size of requests running in parallel.
 */
@Service
@Transactional(readOnly = true)
class SubmissionLimitService(private val backendConfig: BackendConfig, private val dateProvider: DateProvider) {

    fun validateSequenceEntryLimit(uploadType: UploadType, incoming: Long) {
        val limits = backendConfig.submissionLimits
        val (limit, description) = when (uploadType) {
            UploadType.ORIGINAL -> limits.maxNewSequenceEntriesPerDay to "new sequence entries"
            UploadType.REVISION -> limits.maxRevisionsPerDay to "revisions"
        }
        if (limit == null) {
            return
        }
        val windowStart = windowStart()
        val versionCondition = when (uploadType) {
            UploadType.ORIGINAL -> SequenceEntriesTable.versionColumn eq 1L

            UploadType.REVISION -> (SequenceEntriesTable.versionColumn greater 1L) and
                (SequenceEntriesTable.isRevocationColumn eq false)
        }
        val alreadyCreated = SequenceEntriesTable
            .select(SequenceEntriesTable.accessionColumn)
            .where { (SequenceEntriesTable.submittedAtTimestampColumn greaterEq windowStart) and versionCondition }
            .count()
        throwIfExceeded(description, limit, alreadyCreated, incoming)
    }

    fun validateFileUploadLimit(incoming: Long) {
        val limit = backendConfig.submissionLimits.maxFileUploadRequestsPerDay ?: return
        val alreadyRequested = FilesTable
            .select(FilesTable.idColumn)
            .where { FilesTable.uploadRequestedAtColumn greaterEq windowStart() }
            .count()
        throwIfExceeded("file upload requests", limit, alreadyRequested, incoming)
    }

    fun countEntriesInUpload(uploadId: String): Long = MetadataUploadAuxTable
        .select(MetadataUploadAuxTable.submissionIdColumn)
        .where { MetadataUploadAuxTable.uploadIdColumn eq uploadId }
        .count()

    private fun windowStart() = (dateProvider.getCurrentInstant() - LIMIT_WINDOW).toLocalDateTime(DateProvider.timeZone)

    private fun throwIfExceeded(description: String, limit: Long, alreadyCreated: Long, incoming: Long) {
        if (alreadyCreated + incoming > limit) {
            throw TooManyRequestsException(
                "This instance accepts at most $limit $description per 24 hours across all submitters. " +
                    "$alreadyCreated have been created in the last 24 hours, so this request of $incoming " +
                    "would exceed the limit. Please try again later or contact the instance administrators.",
            )
        }
    }
}
