package org.loculus.backend.service.notification

import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import jakarta.mail.Message
import jakarta.mail.Session
import jakarta.mail.internet.MimeMessage
import kotlinx.datetime.LocalDateTime
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.config.BackendConfig
import org.springframework.mail.javamail.JavaMailSender
import java.util.Properties

class ReleaseConfirmationEmailServiceTest {
    private val mailSender = mockk<JavaMailSender>()
    private val backendConfig = mockk<BackendConfig>()
    private val service = ReleaseConfirmationEmailService(
        mailSender = mailSender,
        backendConfig = backendConfig,
        from = "noreply@loculus.org",
        replyTo = "support@loculus.org",
    )

    @Test
    fun `addresses approver and group and includes released accessions`() {
        val message = MimeMessage(Session.getInstance(Properties()))
        every { mailSender.createMimeMessage() } returns message
        justRun { mailSender.send(message) }
        every { backendConfig.websiteUrl } returns "https://loculus.example"
        val notifications = listOf(notification("LOC_1"), notification("LOC_2"))

        service.sendReleaseConfirmation(
            recipientEmail = "approver@example.com",
            ccEmail = "group@example.com",
            notifications = notifications,
            messageId = "<message@loculus>",
        )

        assertThat(message.getRecipients(Message.RecipientType.TO).single().toString(), equalTo("approver@example.com"))
        assertThat(message.getRecipients(Message.RecipientType.CC).single().toString(), equalTo("group@example.com"))
        assertThat(message.subject, equalTo("Loculus: 2 sequences released for Test group"))
        assertThat(message.content.toString(), containsString("LOC_1.1"))
        assertThat(message.content.toString(), containsString("LOC_2.1"))
        assertThat(
            message.content.toString(),
            containsString("https://loculus.example/test-organism/submission/1/released"),
        )
        assertThat(message.getHeader("Message-ID").single(), equalTo("<message@loculus>"))
    }

    @Test
    fun `does not copy the group when it has the approver email`() {
        val message = MimeMessage(Session.getInstance(Properties()))
        every { mailSender.createMimeMessage() } returns message
        justRun { mailSender.send(message) }
        every { backendConfig.websiteUrl } returns "https://loculus.example"

        service.sendReleaseConfirmation(
            recipientEmail = "same@example.com",
            ccEmail = "SAME@example.com",
            notifications = listOf(notification("LOC_1")),
            messageId = "<message@loculus>",
        )

        assertThat(message.getRecipients(Message.RecipientType.CC), equalTo(null))
    }

    private fun notification(accession: String) = PendingReleaseNotification(
        accessionVersion = AccessionVersion(accession, 1),
        organism = "test-organism",
        groupId = 1,
        groupName = "Test group",
        groupContactEmail = "group@example.com",
        approver = "approver",
        releasedAt = LocalDateTime(2026, 7, 10, 12, 0),
    )
}
