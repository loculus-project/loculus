package org.loculus.backend.service.notification

import com.ninjasquad.springmockk.MockkBean
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.select
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
import org.loculus.backend.service.submission.SequenceEntriesTable
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
        assertEquals(setOf(false), pending.map(QueuedReleaseNotification::isRevocation).toSet())
    }

    @Test
    fun `revoked sequences are enqueued and flagged as revocations`() {
        val revoked = convenienceClient.prepareRevokedSequenceEntries()
            .map { AccessionVersion(it.accession, it.version) }

        val flaggedAsRevocation = readPendingReleaseNotifications()
            .filter(QueuedReleaseNotification::isRevocation)
            .map(QueuedReleaseNotification::accessionVersion)
            .toSet()

        assertEquals(revoked.toSet(), flaggedAsRevocation)
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
    val isRevocation: Boolean,
)

private fun readPendingReleaseNotifications(): List<QueuedReleaseNotification> = transaction {
    PendingReleaseNotificationsTable
        .join(
            SequenceEntriesTable,
            JoinType.INNER,
            additionalConstraint = {
                (PendingReleaseNotificationsTable.accessionColumn eq SequenceEntriesTable.accessionColumn) and
                    (PendingReleaseNotificationsTable.versionColumn eq SequenceEntriesTable.versionColumn)
            },
        )
        .select(
            PendingReleaseNotificationsTable.accessionColumn,
            PendingReleaseNotificationsTable.versionColumn,
            SequenceEntriesTable.organismColumn,
            SequenceEntriesTable.approverColumn,
            SequenceEntriesTable.groupIdColumn,
            SequenceEntriesTable.isRevocationColumn,
        )
        .map {
            QueuedReleaseNotification(
                accessionVersion = AccessionVersion(
                    it[PendingReleaseNotificationsTable.accessionColumn],
                    it[PendingReleaseNotificationsTable.versionColumn],
                ),
                organism = it[SequenceEntriesTable.organismColumn],
                approver = it[SequenceEntriesTable.approverColumn],
                groupId = it[SequenceEntriesTable.groupIdColumn],
                isRevocation = it[SequenceEntriesTable.isRevocationColumn],
            )
        }
}
