package org.loculus.backend.service.submission

import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import org.jetbrains.exposed.v1.core.Op
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.count
import org.jetbrains.exposed.v1.core.countDistinct
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.greaterEq
import org.jetbrains.exposed.v1.core.inList
import org.jetbrains.exposed.v1.core.notInList
import org.jetbrains.exposed.v1.core.sum
import org.jetbrains.exposed.v1.jdbc.batchInsert
import org.jetbrains.exposed.v1.jdbc.select
import org.jetbrains.exposed.v1.jdbc.transactions.TransactionManager
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.TooManyRequestsException
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.chunkedForDatabase
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

private val LIMIT_WINDOW = 24.hours

// Arbitrary constant key for pg_advisory_xact_lock, serializing quota checks so parallel requests cannot overshoot.
private const val RATE_LIMIT_ADVISORY_LOCK_KEY = 7434L

private const val ALERT_THRESHOLD_PERCENT = 80

/**
 * Enforces [org.loculus.backend.config.SubmissionLimits]: the number of sequence entries and files affected by write
 * operations in a rolling 24h window, summed over all operations and organisms, taken from [RateLimitOperationsTable].
 * Exempt groups are not limited, groups in `groupQuotas` each have their own quota, and all other groups share one
 * quota, so creating many groups does not raise the amount a submitter can write.
 */
@Service
@Transactional
class SubmissionLimitService(
    private val backendConfig: BackendConfig,
    private val dateProvider: DateProvider,
    private val alertNotifier: RateLimitAlertNotifier,
) {

    private sealed interface Quota {
        data class OwnGroup(val groupId: Int) : Quota
        data object Shared : Quota
    }

    /**
     * Rejects the operation if it would exceed a quota, otherwise records it.
     * Runs in the caller's transaction if there is one, so a failing write does not use up quota.
     */
    fun checkAndRecord(operation: RateLimitedOperation, username: String, countByGroup: Map<Int, Long>) {
        val nonEmpty = countByGroup.filterValues { it > 0 }
        if (nonEmpty.isEmpty()) {
            return
        }
        val limitedQuotas = incomingByQuota(nonEmpty).mapNotNull { (quota, incoming) ->
            limitOf(quota)?.let { Triple(quota, it, incoming) }
        }
        if (limitedQuotas.isNotEmpty()) {
            TransactionManager.current().exec("SELECT pg_advisory_xact_lock($RATE_LIMIT_ADVISORY_LOCK_KEY)")
            limitedQuotas.forEach { (quota, limit, incoming) -> checkQuota(quota, limit, incoming, alert = true) }
        }
        val now = dateProvider.getCurrentDateTime()
        RateLimitOperationsTable.batchInsert(nonEmpty.entries) { (groupId, count) ->
            this[RateLimitOperationsTable.createdAtColumn] = now
            this[RateLimitOperationsTable.operationColumn] = operation
            this[RateLimitOperationsTable.groupIdColumn] = groupId
            this[RateLimitOperationsTable.usernameColumn] = username
            this[RateLimitOperationsTable.countColumn] = count
        }
    }

    /** Fails fast when the quota is already used up, without recording anything. */
    @Transactional(readOnly = true)
    fun checkQuotaNotUsedUp(groupId: Int) {
        incomingByQuota(mapOf(groupId to 1)).forEach { (quota, incoming) ->
            limitOf(quota)?.let { checkQuota(quota, it, incoming, alert = false) }
        }
    }

    /** Group IDs are set on original uploads at insertion and on revisions once they are associated. */
    @Transactional(readOnly = true)
    fun countEntriesInUploadByGroup(uploadId: String): Map<Int, Long> {
        val entries = MetadataUploadAuxTable.submissionIdColumn.count()
        return MetadataUploadAuxTable
            .select(MetadataUploadAuxTable.groupIdColumn, entries)
            .where { MetadataUploadAuxTable.uploadIdColumn eq uploadId }
            .groupBy(MetadataUploadAuxTable.groupIdColumn)
            .associate { it[MetadataUploadAuxTable.groupIdColumn]!! to it[entries] }
    }

    @Transactional(readOnly = true)
    fun countAccessionsByGroup(accessions: Collection<Accession>): Map<Int, Long> {
        val distinctAccessions = SequenceEntriesTable.accessionColumn.countDistinct()
        return accessions.toSet().chunkedForDatabase({ chunk ->
            SequenceEntriesTable
                .select(SequenceEntriesTable.groupIdColumn, distinctAccessions)
                .where { SequenceEntriesTable.accessionColumn inList chunk }
                .groupBy(SequenceEntriesTable.groupIdColumn)
                .map { it[SequenceEntriesTable.groupIdColumn] to it[distinctAccessions] }
        }, 1)
            .groupBy({ it.first }, { it.second })
            .mapValues { (_, counts) -> counts.sum() }
    }

    private fun incomingByQuota(incomingByGroup: Map<Int, Long>): Map<Quota, Long> {
        val limits = backendConfig.submissionLimits
        return incomingByGroup
            .filterKeys { it !in limits.exemptGroupIds }
            .entries
            .groupBy(
                { (groupId, _) -> if (groupId in limits.groupQuotas) Quota.OwnGroup(groupId) else Quota.Shared },
                { (_, incoming) -> incoming },
            )
            .mapValues { (_, incoming) -> incoming.sum() }
    }

    private fun limitOf(quota: Quota): Long? = when (quota) {
        is Quota.OwnGroup -> backendConfig.submissionLimits.groupQuotas.getValue(quota.groupId)
        Quota.Shared -> backendConfig.submissionLimits.maxOperationsPerDay
    }

    private fun windowStart() = (dateProvider.getCurrentInstant() - LIMIT_WINDOW).toLocalDateTime(DateProvider.timeZone)

    private fun quotaCondition(quota: Quota): Op<Boolean> = when (quota) {
        is Quota.OwnGroup -> RateLimitOperationsTable.groupIdColumn eq quota.groupId

        Quota.Shared -> {
            val groupsWithOwnQuota = backendConfig.submissionLimits.let { it.exemptGroupIds + it.groupQuotas.keys }
            if (groupsWithOwnQuota.isEmpty()) {
                Op.TRUE
            } else {
                RateLimitOperationsTable.groupIdColumn notInList groupsWithOwnQuota
            }
        }
    }

    private fun usedInWindow(quota: Quota): Long {
        val used = RateLimitOperationsTable.countColumn.sum()
        return RateLimitOperationsTable
            .select(used)
            .where { (RateLimitOperationsTable.createdAtColumn greaterEq windowStart()) and quotaCondition(quota) }
            .single()[used] ?: 0
    }

    /**
     * The earliest time at which enough of the current usage has left the rolling window for [incoming] to fit,
     * or null if [incoming] alone exceeds the limit.
     */
    private fun earliestRetry(quota: Quota, limit: Long, used: Long, incoming: Long): Instant? {
        if (incoming > limit) {
            return null
        }
        val toFree = used + incoming - limit
        var freed = 0L
        RateLimitOperationsTable
            .select(RateLimitOperationsTable.createdAtColumn, RateLimitOperationsTable.countColumn)
            .where { (RateLimitOperationsTable.createdAtColumn greaterEq windowStart()) and quotaCondition(quota) }
            .orderBy(RateLimitOperationsTable.createdAtColumn)
            .forEach {
                freed += it[RateLimitOperationsTable.countColumn]
                if (freed >= toFree) {
                    return it[RateLimitOperationsTable.createdAtColumn].toInstant(DateProvider.timeZone) + LIMIT_WINDOW
                }
            }
        return dateProvider.getCurrentInstant()
    }

    private fun checkQuota(quota: Quota, limit: Long, incoming: Long, alert: Boolean) {
        val used = usedInWindow(quota)
        val scope = when (quota) {
            is Quota.OwnGroup -> "of group ${quota.groupId}"
            Quota.Shared -> "shared by all groups without their own quota"
        }
        if (used + incoming <= limit) {
            if (alert) {
                val usedAfter = used + incoming
                when {
                    usedAfter >= limit -> alertNotifier.notify(scope, 100, usedAfter, limit)

                    usedAfter * 100 >= limit * ALERT_THRESHOLD_PERCENT ->
                        alertNotifier.notify(scope, ALERT_THRESHOLD_PERCENT, usedAfter, limit)
                }
            }
            return
        }
        if (alert) {
            alertNotifier.notify(scope, 100, used, limit)
        }

        val retryAt = earliestRetry(quota, limit, used, incoming)
            ?.let { Instant.fromEpochSeconds(it.epochSeconds + 1) }
        val whenToRetry = when {
            limit == 0L -> "Writes are currently paused for these groups."
            retryAt == null -> "This request alone is larger than the whole quota, so please split it up."
            else -> "A request of this size can be retried after $retryAt."
        }
        throw TooManyRequestsException(
            "To protect this instance against abuse, the amount of data that can be submitted, revised, revoked, " +
                "edited or changed within 24 hours is limited, and the quota $scope is currently used up " +
                "($used of $limit sequence entries and files; this request needs $incoming). " +
                "This may mean the instance is under attack. $whenToRetry " +
                "If your group regularly needs to submit more, contact the instance administrators to ask for a " +
                "separate quota or an exemption.",
            retryAfterSeconds = retryAt?.let {
                (it - dateProvider.getCurrentInstant()).inWholeSeconds.coerceAtLeast(1)
            },
        )
    }
}
