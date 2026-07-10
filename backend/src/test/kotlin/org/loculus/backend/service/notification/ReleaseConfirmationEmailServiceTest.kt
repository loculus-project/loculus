package org.loculus.backend.service.notification

import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import jakarta.mail.Message
import jakarta.mail.Session
import jakarta.mail.internet.MimeMessage
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
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
        val content = content("LOC_1", "LOC_2")

        service.sendReleaseConfirmation(
            recipientEmail = "approver@example.com",
            ccEmail = "group@example.com",
            approver = "approver",
            groupId = 1,
            content = content,
            messageId = "<message@loculus>",
        )

        assertThat(message.getRecipients(Message.RecipientType.TO).single().toString(), equalTo("approver@example.com"))
        assertThat(message.getRecipients(Message.RecipientType.CC).single().toString(), equalTo("group@example.com"))
        assertThat(message.from.single().toString(), equalTo("noreply@loculus.org"))
        assertThat(message.replyTo.single().toString(), equalTo("support@loculus.org"))
        assertThat(message.subject, equalTo("Loculus: 2 sequences released for Test group"))
        assertThat(message.content.toString(), containsString("LOC_1.1"))
        assertThat(message.content.toString(), containsString("LOC_2.1"))
        assertThat(
            message.content.toString(),
            containsString("https://loculus.example/test-organism/submission/1/released"),
        )
        assertThat(message.getHeader("Message-ID").single(), equalTo("<message@loculus>"))
        assertThat(
            message.content.toString(),
            containsString("and copied to the group's contact email"),
        )
    }

    @Test
    fun `describes the actual delivery when the group is not copied`() {
        val message = MimeMessage(Session.getInstance(Properties()))
        every { mailSender.createMimeMessage() } returns message
        justRun { mailSender.send(message) }
        every { backendConfig.websiteUrl } returns "https://loculus.example"

        service.sendReleaseConfirmation(
            recipientEmail = "same@example.com",
            ccEmail = null,
            approver = "approver",
            groupId = 1,
            content = content("LOC_1"),
            messageId = "<message@loculus>",
        )

        assertThat(message.getRecipients(Message.RecipientType.CC), equalTo(null))
        assertThat(
            message.content.toString(),
            containsString("This message was sent to the user who approved the release."),
        )
    }

    @Test
    fun `rejects invalid configured sender and reply-to addresses`() {
        assertThrows<IllegalArgumentException> {
            ReleaseConfirmationEmailService(mailSender, backendConfig, from = "", replyTo = "")
        }
        assertThrows<IllegalArgumentException> {
            ReleaseConfirmationEmailService(
                mailSender,
                backendConfig,
                from = "noreply@loculus.org",
                replyTo = "not-an-email",
            )
        }
    }

    private fun content(vararg accessions: String) = ReleaseNotificationContent(
        groupName = "Test group",
        groupContactEmail = "group@example.com",
        totalCount = accessions.size.toLong(),
        organisms = listOf(
            ReleaseNotificationOrganismSummary(
                organism = "test-organism",
                count = accessions.size.toLong(),
                accessionVersions = accessions.map { AccessionVersion(it, 1) },
            ),
        ),
    )
}
