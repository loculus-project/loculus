package org.loculus.backend.service.notification

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.everyItem
import org.hamcrest.Matchers.`is`
import org.hamcrest.Matchers.not
import org.hamcrest.Matchers.nullValue
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.service.submission.UpdateTrackerTable
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class ReleaseNotificationDatabaseServiceTest(
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val databaseService: ReleaseNotificationDatabaseService,
) {
    @Test
    fun `released sequences remain pending until their notification is recorded`() {
        val released = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()

        val pending = databaseService.getPendingReleaseNotifications()

        assertThat(pending.map { it.accessionVersion }, containsInAnyOrder(*released.toTypedArray()))
        assertThat(pending.map { it.approver }, everyItem(`is`(DEFAULT_USER_NAME)))
        assertThat(pending.map { it.groupContactEmail }, everyItem(`is`(DEFAULT_GROUP.contactEmail)))
        assertThat(pending.map { it.releasedAt }, everyItem(not(nullValue())))

        databaseService.markNotificationsAsSent(
            pending.map { SentReleaseNotification(it, "approver@example.com") },
            "<message@loculus>",
        )

        assertThat(databaseService.getPendingReleaseNotifications(), empty())
        val notificationTrackerRows = transaction {
            UpdateTrackerTable.selectAll()
                .where { UpdateTrackerTable.tableNameColumn eq SENT_NOTIFICATIONS_TABLE_NAME }
                .count()
        }
        assertThat(notificationTrackerRows, `is`(0L))
    }
}
