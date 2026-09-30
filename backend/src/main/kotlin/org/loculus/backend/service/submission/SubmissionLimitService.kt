package org.loculus.backend.service.submission

import kotlinx.datetime.toLocalDateTime
import org.jetbrains.exposed.v1.core.Column
import org.jetbrains.exposed.v1.core.Op
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.count
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.greater
import org.jetbrains.exposed.v1.core.greaterEq
import org.jetbrains.exposed.v1.core.notInList
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
 * Exempt groups are not limited, each trusted group has its own quota, and all other groups share one quota,
 * so creating many groups does not raise the amount an untrusted submitter can create.
 * Counts are taken from existing rows, so deleted unreleased entries and garbage-collected files free up quota.
 * Concurrent requests are not serialized, so a quota can be overshot by the size of requests running in parallel.
 */
@Service
@Transactional(readOnly = true)
class SubmissionLimitService(private val backendConfig: BackendConfig, private val dateProvider: DateProvider) {

    private sealed interface Quota {
        data class OwnGroup(val groupId: Int) : Quota
        data object Shared : Quota
    }

    fun validateSequenceEntryLimit(uploadType: UploadType, incomingByGroup: Map<Int, Long>) {
        val limits = backendConfig.submissionLimits
        val (limit, description) = when (uploadType) {
            UploadType.ORIGINAL -> limits.maxNewSequenceEntriesPerDay to "new sequence entries"
            UploadType.REVISION -> limits.maxRevisionsPerDay to "revisions"
        }
        if (limit == null) {
            return
        }
        val versionCondition = when (uploadType) {
            UploadType.ORIGINAL -> SequenceEntriesTable.versionColumn eq 1L

            UploadType.REVISION -> (SequenceEntriesTable.versionColumn greater 1L) and
                (SequenceEntriesTable.isRevocationColumn eq false)
        }
        incomingByQuota(incomingByGroup).forEach { (quota, incoming) ->
            val alreadyCreated = SequenceEntriesTable
                .select(SequenceEntriesTable.accessionColumn)
                .where {
                    (SequenceEntriesTable.submittedAtTimestampColumn greaterEq windowStart()) and
                        versionCondition and
                        quotaCondition(quota, SequenceEntriesTable.groupIdColumn)
                }
                .count()
            throwIfExceeded(description, quota, limit, alreadyCreated, incoming)
        }
    }

    fun validateFileUploadLimit(groupId: Int, incoming: Long) {
        val limit = backendConfig.submissionLimits.maxFileUploadRequestsPerDay ?: return
        incomingByQuota(mapOf(groupId to incoming)).forEach { (quota, incoming) ->
            val alreadyRequested = FilesTable
                .select(FilesTable.idColumn)
                .where {
                    (FilesTable.uploadRequestedAtColumn greaterEq windowStart()) and
                        quotaCondition(quota, FilesTable.groupIdColumn)
                }
                .count()
            throwIfExceeded("file upload requests", quota, limit, alreadyRequested, incoming)
        }
    }

    /** Group IDs are set on original uploads at insertion and on revisions once they are associated. */
    fun countEntriesInUploadByGroup(uploadId: String): Map<Int, Long> {
        val entries = MetadataUploadAuxTable.submissionIdColumn.count()
        return MetadataUploadAuxTable
            .select(MetadataUploadAuxTable.groupIdColumn, entries)
            .where { MetadataUploadAuxTable.uploadIdColumn eq uploadId }
            .groupBy(MetadataUploadAuxTable.groupIdColumn)
            .associate { it[MetadataUploadAuxTable.groupIdColumn]!! to it[entries] }
    }

    private fun incomingByQuota(incomingByGroup: Map<Int, Long>): Map<Quota, Long> {
        val limits = backendConfig.submissionLimits
        return incomingByGroup
            .filterKeys { it !in limits.exemptGroupIds }
            .entries
            .groupBy(
                { (groupId, _) -> if (groupId in limits.trustedGroupIds) Quota.OwnGroup(groupId) else Quota.Shared },
                { (_, incoming) -> incoming },
            )
            .mapValues { (_, incoming) -> incoming.sum() }
    }

    private fun quotaCondition(quota: Quota, groupIdColumn: Column<Int>): Op<Boolean> = when (quota) {
        is Quota.OwnGroup -> groupIdColumn eq quota.groupId

        Quota.Shared -> {
            val groupsWithOwnQuota = backendConfig.submissionLimits.let { it.exemptGroupIds + it.trustedGroupIds }
            if (groupsWithOwnQuota.isEmpty()) Op.TRUE else groupIdColumn notInList groupsWithOwnQuota
        }
    }

    private fun windowStart() = (dateProvider.getCurrentInstant() - LIMIT_WINDOW).toLocalDateTime(DateProvider.timeZone)

    private fun throwIfExceeded(description: String, quota: Quota, limit: Long, alreadyCreated: Long, incoming: Long) {
        if (alreadyCreated + incoming <= limit) {
            return
        }
        val scope = when (quota) {
            is Quota.OwnGroup -> "for group ${quota.groupId}"
            Quota.Shared -> "shared by all groups without their own quota"
        }
        throw TooManyRequestsException(
            "The daily quota of $limit $description $scope is used up: $alreadyCreated have been created in the " +
                "last 24 hours, so this request of $incoming would exceed it. Please try again later, or contact " +
                "the instance administrators to request a separate quota for your group.",
        )
    }
}
