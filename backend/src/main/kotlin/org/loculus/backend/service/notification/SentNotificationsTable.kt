package org.loculus.backend.service.notification

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

const val SENT_NOTIFICATIONS_TABLE_NAME = "sent_notifications"
const val RELEASE_CONFIRMATION_NOTIFICATION_TYPE = "RELEASE_CONFIRMATION"

object SentNotificationsTable : Table(SENT_NOTIFICATIONS_TABLE_NAME) {
    val notificationTypeColumn = varchar("notification_type", 64)
    val accessionColumn = text("accession")
    val versionColumn = long("version")
    val groupIdColumn = integer("group_id")
    val recipientUsernameColumn = text("recipient_username")
    val recipientEmailColumn = text("recipient_email")
    val ccEmailColumn = text("cc_email")
    val messageIdColumn = text("message_id")
    val sentAtColumn = datetime("sent_at")

    override val primaryKey = PrimaryKey(notificationTypeColumn, accessionColumn, versionColumn)
}
