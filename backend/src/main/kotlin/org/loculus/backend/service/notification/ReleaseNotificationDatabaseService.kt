package org.loculus.backend.service.notification

import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.min
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.service.groupmanagement.GroupsTable
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
     * Only approvals performed while release-confirmation emails are enabled call this method, so an empty queue at
     * deployment is the feature cutover: historical releases are deliberately not backfilled.
     */
    fun enqueueReleaseNotifications(
        approver: String,
        organism: String,
        accessionVersionsByGroup: Map<Int, List<AccessionVersion>>,
    ) {
        require(approver.isNotBlank()) { "Cannot enqueue a release notification without an approver" }
        if (accessionVersionsByGroup.isEmpty()) return

        val enqueuedAt = dateProvider.getCurrentDateTime()
        val notifications = accessionVersionsByGroup.flatMap { (groupId, accessionVersions) ->
            accessionVersions.map { accessionVersion ->
                NewPendingReleaseNotification(accessionVersion, organism, groupId)
            }
        }

        PendingReleaseNotificationsTable.batchInsert(notifications, shouldReturnGeneratedValues = false) {
            this[PendingReleaseNotificationsTable.accessionColumn] = it.accessionVersion.accession
            this[PendingReleaseNotificationsTable.versionColumn] = it.accessionVersion.version
            this[PendingReleaseNotificationsTable.organismColumn] = it.organism
            this[PendingReleaseNotificationsTable.groupIdColumn] = it.groupId
            this[PendingReleaseNotificationsTable.approverColumn] = approver
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
        val selectedPartitions = PendingReleaseNotificationsTable
            .select(
                PendingReleaseNotificationsTable.approverColumn,
                PendingReleaseNotificationsTable.groupIdColumn,
                oldestEnqueuedAt,
            )
            .groupBy(
                PendingReleaseNotificationsTable.approverColumn,
                PendingReleaseNotificationsTable.groupIdColumn,
            )
            .orderBy(
                oldestEnqueuedAt to SortOrder.ASC,
                PendingReleaseNotificationsTable.approverColumn to SortOrder.ASC,
                PendingReleaseNotificationsTable.groupIdColumn to SortOrder.ASC,
            )
            .limit(maxPartitions)
            .map {
                it[PendingReleaseNotificationsTable.approverColumn] to
                    it[PendingReleaseNotificationsTable.groupIdColumn]
            }
        if (selectedPartitions.isEmpty()) return emptyList()

        val pendingRows = PendingReleaseNotificationsTable
            .selectAll()
            .where {
                Pair(
                    PendingReleaseNotificationsTable.approverColumn,
                    PendingReleaseNotificationsTable.groupIdColumn,
                ) inList selectedPartitions
            }
            .orderBy(
                PendingReleaseNotificationsTable.approverColumn to SortOrder.ASC,
                PendingReleaseNotificationsTable.groupIdColumn to SortOrder.ASC,
                PendingReleaseNotificationsTable.enqueuedAtColumn to SortOrder.ASC,
                PendingReleaseNotificationsTable.organismColumn to SortOrder.ASC,
                PendingReleaseNotificationsTable.accessionColumn to SortOrder.ASC,
                PendingReleaseNotificationsTable.versionColumn to SortOrder.ASC,
            )
            .toList()

        val groupIds = pendingRows
            .map { it[PendingReleaseNotificationsTable.groupIdColumn] }
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
            val groupId = row[PendingReleaseNotificationsTable.groupIdColumn]
            val group = checkNotNull(groups[groupId]) { "Group $groupId not found for pending notification" }
            PendingReleaseNotification(
                accessionVersion = AccessionVersion(
                    row[PendingReleaseNotificationsTable.accessionColumn],
                    row[PendingReleaseNotificationsTable.versionColumn],
                ),
                organism = row[PendingReleaseNotificationsTable.organismColumn],
                groupId = groupId,
                groupName = group.name,
                groupContactEmail = group.contactEmail,
                approver = row[PendingReleaseNotificationsTable.approverColumn],
                enqueuedAt = row[PendingReleaseNotificationsTable.enqueuedAtColumn],
            )
        }
    }

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

    private data class NewPendingReleaseNotification(
        val accessionVersion: AccessionVersion,
        val organism: String,
        val groupId: Int,
    )

    private data class GroupNotificationDetails(val name: String, val contactEmail: String)

    private companion object {
        const val MAX_DELETE_BATCH_SIZE = 1000
    }
}

const val DEFAULT_MAX_RELEASE_NOTIFICATION_PARTITIONS_PER_RUN = 10
