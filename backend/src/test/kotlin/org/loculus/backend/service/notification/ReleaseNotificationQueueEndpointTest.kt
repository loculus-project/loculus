package org.loculus.backend.service.notification

import com.ninjasquad.springmockk.MockkBean
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest(
    properties = [
        "${BackendSpringProperty.RELEASE_CONFIRMATION_EMAILS_ENABLED}=false",
    ],
)
class ReleaseNotificationQueueDisabledEndpointTest(
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
) {
    @Test
    fun `approval does not enqueue notifications when release emails are disabled`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()

        assertTrue(readPendingReleaseNotifications().isEmpty())
    }
}

@EndpointTest(
    properties = [
        "${BackendSpringProperty.RELEASE_CONFIRMATION_EMAILS_ENABLED}=true",
        "${BackendSpringProperty.RELEASE_CONFIRMATION_EMAILS_RUN_EVERY_SECONDS}=2147483647",
        "${BackendSpringProperty.RELEASE_CONFIRMATION_EMAILS_FROM}=noreply@example.com",
        "spring.mail.host=localhost",
    ],
)
class ReleaseNotificationQueueEnabledEndpointTest(
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
) {
    @MockkBean(relaxed = true)
    lateinit var releaseConfirmationEmailTask: ReleaseConfirmationEmailTask

    @Test
    fun `approval enqueues exactly the released accession versions`() {
        val released = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
            .map { AccessionVersion(it.accession, it.version) }

        val pending = readPendingReleaseNotifications()

        assertEquals(released.toSet(), pending.map(QueuedReleaseNotification::accessionVersion).toSet())
        assertEquals(setOf(DEFAULT_USER_NAME), pending.map(QueuedReleaseNotification::approver).toSet())
        assertEquals(setOf(DEFAULT_ORGANISM), pending.map(QueuedReleaseNotification::organism).toSet())
        assertEquals(1, pending.map(QueuedReleaseNotification::groupId).toSet().size)
    }

    @Test
    fun `later approvals append to the existing pending work`() {
        val firstRelease = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        val groupId = readPendingReleaseNotifications().map(QueuedReleaseNotification::groupId).toSet().single()
        val secondRelease = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(groupId = groupId)

        val pendingAccessions = readPendingReleaseNotifications()
            .map(QueuedReleaseNotification::accessionVersion)
            .toSet()

        assertEquals(
            (firstRelease + secondRelease).map { AccessionVersion(it.accession, it.version) }.toSet(),
            pendingAccessions,
        )
    }
}

private data class QueuedReleaseNotification(
    val accessionVersion: AccessionVersion,
    val organism: String,
    val approver: String,
    val groupId: Int,
)

private fun readPendingReleaseNotifications(): List<QueuedReleaseNotification> = transaction {
    PendingReleaseNotificationsTable.selectAll().map {
        QueuedReleaseNotification(
            accessionVersion = AccessionVersion(
                it[PendingReleaseNotificationsTable.accessionColumn],
                it[PendingReleaseNotificationsTable.versionColumn],
            ),
            organism = it[PendingReleaseNotificationsTable.organismColumn],
            approver = it[PendingReleaseNotificationsTable.approverColumn],
            groupId = it[PendingReleaseNotificationsTable.groupIdColumn],
        )
    }
}
