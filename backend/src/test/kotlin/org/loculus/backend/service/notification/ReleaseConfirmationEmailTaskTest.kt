package org.loculus.backend.service.notification

import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import io.mockk.verify
import kotlinx.datetime.LocalDateTime
import org.junit.jupiter.api.Test
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.service.KeycloakAdapter

class ReleaseConfirmationEmailTaskTest {
    private val databaseService = mockk<ReleaseNotificationDatabaseService>()
    private val emailService = mockk<ReleaseConfirmationEmailService>()
    private val keycloakAdapter = mockk<KeycloakAdapter>()
    private val task = ReleaseConfirmationEmailTask(databaseService, emailService, keycloakAdapter)

    @Test
    fun `groups releases by approver and group and records successful sends`() {
        val firstGroup = listOf(
            pendingNotification("LOC_1", groupId = 1),
            pendingNotification("LOC_2", groupId = 1),
        )
        val secondGroup = listOf(pendingNotification("LOC_3", groupId = 2, ccEmail = "other-group@example.com"))
        every { databaseService.getPendingReleaseNotifications() } returns firstGroup + secondGroup
        every { keycloakAdapter.getUsersWithName("approver") } returns listOf(keycloakUser("approver@example.com"))
        justRun { emailService.sendReleaseConfirmation(any(), any(), any(), any()) }
        justRun { databaseService.markNotificationsAsSent(any(), any()) }

        task.task()

        verify(exactly = 1) {
            emailService.sendReleaseConfirmation(
                recipientEmail = "approver@example.com",
                ccEmail = "group@example.com",
                notifications = firstGroup,
                messageId = any(),
            )
        }
        verify(exactly = 1) {
            emailService.sendReleaseConfirmation(
                recipientEmail = "approver@example.com",
                ccEmail = "other-group@example.com",
                notifications = secondGroup,
                messageId = any(),
            )
        }
        verify(exactly = 2) { databaseService.markNotificationsAsSent(any(), any()) }
    }

    @Test
    fun `does not record a failed email and continues with other groups`() {
        val failed = pendingNotification("LOC_1", groupId = 1)
        val successful = pendingNotification("LOC_2", groupId = 2, ccEmail = "other-group@example.com")
        every { databaseService.getPendingReleaseNotifications() } returns listOf(failed, successful)
        every { keycloakAdapter.getUsersWithName("approver") } returns listOf(keycloakUser("approver@example.com"))
        every {
            emailService.sendReleaseConfirmation("approver@example.com", "group@example.com", listOf(failed), any())
        } throws IllegalStateException("SMTP unavailable")
        justRun {
            emailService.sendReleaseConfirmation(
                "approver@example.com",
                "other-group@example.com",
                listOf(successful),
                any(),
            )
        }
        justRun { databaseService.markNotificationsAsSent(any(), any()) }

        task.task()

        verify(exactly = 1) {
            databaseService.markNotificationsAsSent(
                match { it.map(SentReleaseNotification::pendingNotification) == listOf(successful) },
                any(),
            )
        }
    }

    private fun pendingNotification(accession: String, groupId: Int, ccEmail: String = "group@example.com") =
        PendingReleaseNotification(
            accessionVersion = AccessionVersion(accession, 1),
            organism = "test-organism",
            groupId = groupId,
            groupName = "Test group $groupId",
            groupContactEmail = ccEmail,
            approver = "approver",
            releasedAt = LocalDateTime(2026, 7, 10, 12, 0),
        )

    private fun keycloakUser(email: String) = UserRepresentation().apply {
        username = "approver"
        this.email = email
    }
}
