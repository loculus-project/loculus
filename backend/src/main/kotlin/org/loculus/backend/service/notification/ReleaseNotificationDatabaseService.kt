package org.loculus.backend.service.notification

import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNotNull
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.notExists
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
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
    val releasedAt: LocalDateTime,
)

data class SentReleaseNotification(val pendingNotification: PendingReleaseNotification, val recipientEmail: String)

@Service
@Transactional
class ReleaseNotificationDatabaseService(private val dateProvider: DateProvider) {
    fun getPendingReleaseNotifications(): List<PendingReleaseNotification> {
        val alreadySent = SentNotificationsTable
            .select(SentNotificationsTable.accessionColumn)
            .where {
                (SentNotificationsTable.notificationTypeColumn eq RELEASE_CONFIRMATION_NOTIFICATION_TYPE) and
                    (SentNotificationsTable.accessionColumn eq SequenceEntriesTable.accessionColumn) and
                    (SentNotificationsTable.versionColumn eq SequenceEntriesTable.versionColumn)
            }

        val pendingEntries = SequenceEntriesTable
            .select(
                SequenceEntriesTable.accessionColumn,
                SequenceEntriesTable.versionColumn,
                SequenceEntriesTable.organismColumn,
                SequenceEntriesTable.groupIdColumn,
                SequenceEntriesTable.approverColumn,
                SequenceEntriesTable.releasedAtTimestampColumn,
            )
            .where {
                SequenceEntriesTable.releasedAtTimestampColumn.isNotNull() and notExists(alreadySent)
            }
            .map {
                PendingEntry(
                    accessionVersion = AccessionVersion(
                        it[SequenceEntriesTable.accessionColumn],
                        it[SequenceEntriesTable.versionColumn],
                    ),
                    organism = it[SequenceEntriesTable.organismColumn],
                    groupId = it[SequenceEntriesTable.groupIdColumn],
                    approver = it[SequenceEntriesTable.approverColumn],
                    releasedAt = it[SequenceEntriesTable.releasedAtTimestampColumn]!!,
                )
            }

        if (pendingEntries.isEmpty()) return emptyList()

        val groups = GroupsTable
            .select(GroupsTable.id, GroupsTable.groupNameColumn, GroupsTable.contactEmailColumn)
            .where { GroupsTable.id inList pendingEntries.map { it.groupId }.distinct() }
            .associate {
                it[GroupsTable.id].value to GroupNotificationDetails(
                    name = it[GroupsTable.groupNameColumn],
                    contactEmail = it[GroupsTable.contactEmailColumn],
                )
            }

        return pendingEntries.map { entry ->
            val group =
                checkNotNull(groups[entry.groupId]) { "Group ${entry.groupId} not found for pending notification" }
            PendingReleaseNotification(
                accessionVersion = entry.accessionVersion,
                organism = entry.organism,
                groupId = entry.groupId,
                groupName = group.name,
                groupContactEmail = group.contactEmail,
                approver = entry.approver,
                releasedAt = entry.releasedAt,
            )
        }
    }

    fun markNotificationsAsSent(notifications: List<SentReleaseNotification>, messageId: String) {
        val sentAt = dateProvider.getCurrentDateTime()
        SentNotificationsTable.batchInsert(notifications, shouldReturnGeneratedValues = false) { notification ->
            val pending = notification.pendingNotification
            this[SentNotificationsTable.notificationTypeColumn] = RELEASE_CONFIRMATION_NOTIFICATION_TYPE
            this[SentNotificationsTable.accessionColumn] = pending.accessionVersion.accession
            this[SentNotificationsTable.versionColumn] = pending.accessionVersion.version
            this[SentNotificationsTable.groupIdColumn] = pending.groupId
            this[SentNotificationsTable.recipientUsernameColumn] = pending.approver
            this[SentNotificationsTable.recipientEmailColumn] = notification.recipientEmail
            this[SentNotificationsTable.ccEmailColumn] = pending.groupContactEmail
            this[SentNotificationsTable.messageIdColumn] = messageId
            this[SentNotificationsTable.sentAtColumn] = sentAt
        }
    }

    private data class PendingEntry(
        val accessionVersion: AccessionVersion,
        val organism: String,
        val groupId: Int,
        val approver: String,
        val releasedAt: LocalDateTime,
    )

    private data class GroupNotificationDetails(val name: String, val contactEmail: String)
}
