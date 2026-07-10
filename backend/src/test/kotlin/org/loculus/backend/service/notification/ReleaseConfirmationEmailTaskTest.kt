package org.loculus.backend.service.notification

import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import io.mockk.verifyOrder
import kotlinx.datetime.LocalDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.service.KeycloakAdapter

class ReleaseConfirmationEmailTaskTest {
    private val databaseService = mockk<ReleaseNotificationDatabaseService>()
    private val emailService = mockk<ReleaseConfirmationEmailService>()
    private val keycloakAdapter = mockk<KeycloakAdapter>()
    private val task = ReleaseConfirmationEmailTask(databaseService, emailService, keycloakAdapter)

    @Test
    fun `takes one snapshot and sends one email per approver and group before deleting`() {
        val firstBatch = listOf(
            notification("LOC_2", organism = "zeta-organism"),
            notification("LOC_1", organism = "alpha-organism"),
        )
        val secondBatch = listOf(notification("LOC_3", groupId = 2))
        val thirdBatch = listOf(notification("LOC_4", approver = "other"))
        every {
            databaseService.getPendingReleaseNotifications()
        } returns firstBatch + secondBatch + thirdBatch
        givenKeycloakUser("approver", "approver@example.com")
        givenKeycloakUser("other", "other@example.com")
        justRun { emailService.sendReleaseConfirmation(any(), any(), any(), any(), any(), any()) }
        justRun { databaseService.deletePendingReleaseNotifications(any()) }

        val firstContent = ReleaseNotificationContent(
            groupName = "Group 1",
            groupContactEmail = "group-1@example.com",
            totalCount = 2,
            kindCounts = mapOf(ReleaseKind.NEW to 2L),
            organisms = listOf(
                ReleaseNotificationOrganismSummary(
                    organism = "alpha-organism",
                    count = 1,
                    accessions = listOf(ReleasedAccessionVersion(AccessionVersion("LOC_1", 1), ReleaseKind.NEW)),
                ),
                ReleaseNotificationOrganismSummary(
                    organism = "zeta-organism",
                    count = 1,
                    accessions = listOf(ReleasedAccessionVersion(AccessionVersion("LOC_2", 1), ReleaseKind.NEW)),
                ),
            ),
        )
        val secondContent = contentFor(secondBatch.single())
        val thirdContent = contentFor(thirdBatch.single())

        task.task()

        verify(exactly = 1) { databaseService.getPendingReleaseNotifications() }
        verify(exactly = 3) {
            emailService.sendReleaseConfirmation(any(), any(), any(), any(), any(), any())
        }
        verifyOrder {
            emailService.sendReleaseConfirmation(
                "approver@example.com",
                "group-1@example.com",
                "approver",
                1,
                firstContent,
                any(),
            )
            databaseService.deletePendingReleaseNotifications(firstBatch)
            emailService.sendReleaseConfirmation(
                "approver@example.com",
                "group-2@example.com",
                "approver",
                2,
                secondContent,
                any(),
            )
            databaseService.deletePendingReleaseNotifications(secondBatch)
            emailService.sendReleaseConfirmation(
                "other@example.com",
                "group-1@example.com",
                "other",
                1,
                thirdContent,
                any(),
            )
            databaseService.deletePendingReleaseNotifications(thirdBatch)
        }
    }

    @Test
    fun `retains a failed group and continues with another group`() {
        val failedBatch = listOf(notification("LOC_1", approver = "first"))
        val successfulBatch = listOf(notification("LOC_2", groupId = 2, approver = "second"))
        every {
            databaseService.getPendingReleaseNotifications()
        } returns failedBatch + successfulBatch
        givenKeycloakUser("first", "first@example.com")
        givenKeycloakUser("second", "second@example.com")
        every {
            emailService.sendReleaseConfirmation(
                "first@example.com",
                "group-1@example.com",
                "first",
                1,
                contentFor(failedBatch.single()),
                any(),
            )
        } throws IllegalStateException("SMTP unavailable")
        justRun {
            emailService.sendReleaseConfirmation(
                "second@example.com",
                "group-2@example.com",
                "second",
                2,
                contentFor(successfulBatch.single()),
                any(),
            )
        }
        justRun { databaseService.deletePendingReleaseNotifications(successfulBatch) }

        task.task()

        verify(exactly = 0) {
            databaseService.deletePendingReleaseNotifications(match { it == failedBatch })
        }
        verify(exactly = 1) { databaseService.deletePendingReleaseNotifications(successfulBatch) }
        verify(exactly = 1) {
            emailService.sendReleaseConfirmation(
                "second@example.com",
                "group-2@example.com",
                "second",
                2,
                contentFor(successfulBatch.single()),
                any(),
            )
        }
    }

    @ParameterizedTest
    @ValueSource(strings = ["", "not-an-email", "APPROVER@example.com"])
    fun `omits an unusable or duplicate group address`(groupContactEmail: String) {
        val batch = listOf(notification("LOC_1", groupContactEmail = groupContactEmail))
        every { databaseService.getPendingReleaseNotifications() } returns batch
        givenKeycloakUser("approver", "approver@example.com")
        justRun { emailService.sendReleaseConfirmation(any(), any(), any(), any(), any(), any()) }
        justRun { databaseService.deletePendingReleaseNotifications(batch) }

        task.task()

        verify(exactly = 1) {
            emailService.sendReleaseConfirmation(
                "approver@example.com",
                null,
                "approver",
                1,
                contentFor(batch.single()),
                any(),
            )
        }
        verify(exactly = 1) { databaseService.deletePendingReleaseNotifications(batch) }
    }

    @Test
    fun `caps displayed accessions per organism without dropping queued rows`() {
        val batch = (105 downTo 1).map { index ->
            notification("LOC_${index.toString().padStart(3, '0')}")
        }
        val expectedContent = ReleaseNotificationContent(
            groupName = "Group 1",
            groupContactEmail = "group-1@example.com",
            totalCount = 105,
            kindCounts = mapOf(ReleaseKind.NEW to 105L),
            organisms = listOf(
                ReleaseNotificationOrganismSummary(
                    organism = "test-organism",
                    count = 105,
                    accessions = (1..100).map { index ->
                        ReleasedAccessionVersion(
                            AccessionVersion("LOC_${index.toString().padStart(3, '0')}", 1),
                            ReleaseKind.NEW,
                        )
                    },
                ),
            ),
        )
        every { databaseService.getPendingReleaseNotifications() } returns batch
        givenKeycloakUser("approver", "approver@example.com")
        justRun { emailService.sendReleaseConfirmation(any(), any(), any(), any(), any(), any()) }
        justRun { databaseService.deletePendingReleaseNotifications(batch) }

        task.task()

        verify(exactly = 1) {
            emailService.sendReleaseConfirmation(
                "approver@example.com",
                "group-1@example.com",
                "approver",
                1,
                expectedContent,
                any(),
            )
        }
        verify(exactly = 1) { databaseService.deletePendingReleaseNotifications(batch) }
    }

    @Test
    fun `classifies new submissions, revisions, and revocations`() {
        val batch = listOf(
            notification("LOC_1", version = 1),
            notification("LOC_2", version = 3),
            notification("LOC_3", version = 2, isRevocation = true),
        )
        every { databaseService.getPendingReleaseNotifications() } returns batch
        givenKeycloakUser("approver", "approver@example.com")
        val contentSlot = slot<ReleaseNotificationContent>()
        justRun {
            emailService.sendReleaseConfirmation(any(), any(), any(), any(), capture(contentSlot), any())
        }
        justRun { databaseService.deletePendingReleaseNotifications(batch) }

        task.task()

        assertEquals(
            mapOf(ReleaseKind.NEW to 1L, ReleaseKind.REVISION to 1L, ReleaseKind.REVOCATION to 1L),
            contentSlot.captured.kindCounts,
        )
        assertEquals(
            listOf(
                ReleasedAccessionVersion(AccessionVersion("LOC_1", 1), ReleaseKind.NEW),
                ReleasedAccessionVersion(AccessionVersion("LOC_2", 3), ReleaseKind.REVISION),
                ReleasedAccessionVersion(AccessionVersion("LOC_3", 2), ReleaseKind.REVOCATION),
            ),
            contentSlot.captured.organisms.single().accessions,
        )
    }

    private fun notification(
        accession: String,
        version: Long = 1,
        organism: String = "test-organism",
        groupId: Int = 1,
        approver: String = "approver",
        groupContactEmail: String = "group-$groupId@example.com",
        isRevocation: Boolean = false,
    ) = PendingReleaseNotification(
        accessionVersion = AccessionVersion(accession, version),
        organism = organism,
        groupId = groupId,
        groupName = "Group $groupId",
        groupContactEmail = groupContactEmail,
        approver = approver,
        isRevocation = isRevocation,
        enqueuedAt = LocalDateTime(2026, 7, 10, 12, 0),
    )

    private fun contentFor(notification: PendingReleaseNotification) = ReleaseNotificationContent(
        groupName = notification.groupName,
        groupContactEmail = notification.groupContactEmail,
        totalCount = 1,
        kindCounts = mapOf(notification.kind to 1L),
        organisms = listOf(
            ReleaseNotificationOrganismSummary(
                organism = notification.organism,
                count = 1,
                accessions = listOf(ReleasedAccessionVersion(notification.accessionVersion, notification.kind)),
            ),
        ),
    )

    private fun keycloakUser(username: String, email: String) = UserRepresentation().apply {
        this.username = username
        this.email = email
    }

    private fun givenKeycloakUser(username: String, email: String) {
        every { keycloakAdapter.getUsersWithName(username) } returns listOf(keycloakUser(username, email))
    }
}
