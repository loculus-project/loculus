package org.loculus.backend.service.notification

import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.min
import org.jetbrains.exposed.sql.select
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.service.groupmanagement.GroupsTable
import org.loculus.backend.service.submission.SequenceEntriesTable
import org.loculus.backend.utils.DateProvider
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class PendingReleaseNotification(
    val accessionVersion: AccessionVersion,
    val organism: String,
    val groupId: Int,
    val groupName: String,
    val groupContactEmail: String,
    val approver: String,
    val enqueuedAt: LocalDateTime,
)

data class ReleaseNotificationContent(
    val groupName: String,
    val groupContactEmail: String,
    val totalCount: Long,
    val organisms: List<ReleaseNotificationOrganismSummary>,
)

data class ReleaseNotificationOrganismSummary(
    val organism: String,
    val count: Long,
    val accessionVersions: List<AccessionVersion>,
)

@Service
@Transactional
class ReleaseNotificationDatabaseService(private val dateProvider: DateProvider) {
    /**
     * Adds notification work in the surrounding approval transaction.
     *
     * The queue stores only the released accession versions; approver, organism, and group are read back from
     * `sequence_entries`, which the surrounding transaction has already updated with the current approval.
     *
     * Only approvals performed while release-confirmation emails are enabled call this method, so an empty queue at
     * deployment is the feature cutover: historical releases are deliberately not backfilled.
     */
    fun enqueueReleaseNotifications(accessionVersions: Collection<AccessionVersion>) {
        if (accessionVersions.isEmpty()) return

        val enqueuedAt = dateProvider.getCurrentDateTime()
        PendingReleaseNotificationsTable.batchInsert(accessionVersions, shouldReturnGeneratedValues = false) {
            this[PendingReleaseNotificationsTable.accessionColumn] = it.accession
            this[PendingReleaseNotificationsTable.versionColumn] = it.version
            this[PendingReleaseNotificationsTable.enqueuedAtColumn] = enqueuedAt
        }
    }

    /**
     * Returns one immutable snapshot of the current queue for a scheduler run.
     *
     * The task groups this snapshot once by approver/group. Rows committed after this query are not part of the
     * snapshot and therefore cannot be deleted after the corresponding email is sent.
     */
    fun getPendingReleaseNotifications(
        maxPartitions: Int = DEFAULT_MAX_RELEASE_NOTIFICATION_PARTITIONS_PER_RUN,
    ): List<PendingReleaseNotification> {
        require(maxPartitions > 0) { "maxPartitions must be positive" }

        val oldestEnqueuedAt = PendingReleaseNotificationsTable.enqueuedAtColumn.min()
        val selectedPartitions = pendingJoinedWithSequenceEntries
            .select(
                SequenceEntriesTable.approverColumn,
                SequenceEntriesTable.groupIdColumn,
                oldestEnqueuedAt,
            )
            .groupBy(
                SequenceEntriesTable.approverColumn,
                SequenceEntriesTable.groupIdColumn,
            )
            .orderBy(
                oldestEnqueuedAt to SortOrder.ASC,
                SequenceEntriesTable.approverColumn to SortOrder.ASC,
                SequenceEntriesTable.groupIdColumn to SortOrder.ASC,
            )
            .limit(maxPartitions)
            .map {
                it[SequenceEntriesTable.approverColumn] to
                    it[SequenceEntriesTable.groupIdColumn]
            }
        if (selectedPartitions.isEmpty()) return emptyList()

        val pendingRows = pendingJoinedWithSequenceEntries
            .select(
                PendingReleaseNotificationsTable.accessionColumn,
                PendingReleaseNotificationsTable.versionColumn,
                PendingReleaseNotificationsTable.enqueuedAtColumn,
                SequenceEntriesTable.organismColumn,
                SequenceEntriesTable.approverColumn,
                SequenceEntriesTable.groupIdColumn,
            )
            .where {
                Pair(
                    SequenceEntriesTable.approverColumn,
                    SequenceEntriesTable.groupIdColumn,
                ) inList selectedPartitions
            }
            .orderBy(
                SequenceEntriesTable.approverColumn to SortOrder.ASC,
                SequenceEntriesTable.groupIdColumn to SortOrder.ASC,
                PendingReleaseNotificationsTable.enqueuedAtColumn to SortOrder.ASC,
                SequenceEntriesTable.organismColumn to SortOrder.ASC,
                PendingReleaseNotificationsTable.accessionColumn to SortOrder.ASC,
                PendingReleaseNotificationsTable.versionColumn to SortOrder.ASC,
            )
            .toList()

        val groupIds = pendingRows
            .map { it[SequenceEntriesTable.groupIdColumn] }
            .distinct()
        val groups = GroupsTable
            .select(GroupsTable.id, GroupsTable.groupNameColumn, GroupsTable.contactEmailColumn)
            .where { GroupsTable.id inList groupIds }
            .associate {
                it[GroupsTable.id].value to GroupNotificationDetails(
                    name = it[GroupsTable.groupNameColumn],
                    contactEmail = it[GroupsTable.contactEmailColumn],
                )
            }

        return pendingRows.map { row ->
            val groupId = row[SequenceEntriesTable.groupIdColumn]
            val group = checkNotNull(groups[groupId]) { "Group $groupId not found for pending notification" }
            PendingReleaseNotification(
                accessionVersion = AccessionVersion(
                    row[PendingReleaseNotificationsTable.accessionColumn],
                    row[PendingReleaseNotificationsTable.versionColumn],
                ),
                organism = row[SequenceEntriesTable.organismColumn],
                groupId = groupId,
                groupName = group.name,
                groupContactEmail = group.contactEmail,
                approver = row[SequenceEntriesTable.approverColumn],
                enqueuedAt = row[PendingReleaseNotificationsTable.enqueuedAtColumn],
            )
        }
    }

    private val pendingJoinedWithSequenceEntries
        get() = PendingReleaseNotificationsTable.join(
            SequenceEntriesTable,
            JoinType.INNER,
            additionalConstraint = {
                (PendingReleaseNotificationsTable.accessionColumn eq SequenceEntriesTable.accessionColumn) and
                    (PendingReleaseNotificationsTable.versionColumn eq SequenceEntriesTable.versionColumn)
            },
        )

    /** Deletes exactly the rows included in a successfully delivered scheduler snapshot. */
    fun deletePendingReleaseNotifications(notifications: Collection<PendingReleaseNotification>) {
        notifications
            .map(PendingReleaseNotification::accessionVersion)
            .chunked(MAX_DELETE_BATCH_SIZE)
            .forEach { accessionVersions ->
                PendingReleaseNotificationsTable.deleteWhere {
                    PendingReleaseNotificationsTable.accessionVersionIsIn(accessionVersions)
                }
            }
    }

    private data class GroupNotificationDetails(val name: String, val contactEmail: String)

    private companion object {
        const val MAX_DELETE_BATCH_SIZE = 1000
    }
}

const val DEFAULT_MAX_RELEASE_NOTIFICATION_PARTITIONS_PER_RUN = 10
