package org.loculus.backend.service.notification

import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.toPairs
import org.loculus.backend.service.groupmanagement.GroupsTable

const val PENDING_RELEASE_NOTIFICATIONS_TABLE_NAME = "pending_release_notifications"

object PendingReleaseNotificationsTable : Table(PENDING_RELEASE_NOTIFICATIONS_TABLE_NAME) {
    val accessionColumn = text("accession")
    val versionColumn = long("version")
    val organismColumn = text("organism")
    val approverColumn = text("approver")
    val groupIdColumn = integer("group_id").references(GroupsTable.id)
    val enqueuedAtColumn = datetime("enqueued_at")

    override val primaryKey = PrimaryKey(accessionColumn, versionColumn)

    fun accessionVersionIsIn(accessionVersions: List<AccessionVersionInterface>) =
        Pair(accessionColumn, versionColumn) inList accessionVersions.toPairs()
}
