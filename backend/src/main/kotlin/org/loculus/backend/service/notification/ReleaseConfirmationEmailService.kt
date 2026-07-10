package org.loculus.backend.service.notification

import jakarta.mail.internet.MimeMessage
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.RELEASE_CONFIRMATION_EMAILS_ENABLED_VALUE
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.MimeMessageHelper
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets

@Service
@ConditionalOnProperty(
    BackendSpringProperty.RELEASE_CONFIRMATION_EMAILS_ENABLED,
    havingValue = RELEASE_CONFIRMATION_EMAILS_ENABLED_VALUE,
)
class ReleaseConfirmationEmailService(
    private val mailSender: JavaMailSender,
    private val backendConfig: BackendConfig,
    @Value("\${${BackendSpringProperty.RELEASE_CONFIRMATION_EMAILS_FROM}}") private val from: String,
    @Value("\${${BackendSpringProperty.RELEASE_CONFIRMATION_EMAILS_REPLY_TO}}") private val replyTo: String,
) {
    fun sendReleaseConfirmation(
        recipientEmail: String,
        ccEmail: String,
        notifications: List<PendingReleaseNotification>,
        messageId: String,
    ) {
        require(notifications.isNotEmpty()) { "Cannot send an empty release confirmation" }

        val message = mailSender.createMimeMessage()
        populateMessage(message, recipientEmail, ccEmail, notifications, messageId)
        mailSender.send(message)
    }

    private fun populateMessage(
        message: MimeMessage,
        recipientEmail: String,
        ccEmail: String,
        notifications: List<PendingReleaseNotification>,
        messageId: String,
    ) {
        val helper = MimeMessageHelper(message, false, StandardCharsets.UTF_8.name())
        helper.setFrom(from)
        helper.setTo(recipientEmail)
        if (!recipientEmail.equals(ccEmail, ignoreCase = true)) {
            helper.setCc(ccEmail)
        }
        if (replyTo.isNotBlank()) {
            helper.setReplyTo(replyTo)
        }
        helper.setSubject(buildSubject(notifications))
        helper.setText(buildBody(notifications), false)
        message.setHeader("Message-ID", messageId)
    }

    private fun buildSubject(notifications: List<PendingReleaseNotification>): String {
        val count = notifications.size
        val sequenceWord = if (count == 1) "sequence" else "sequences"
        return "Loculus: $count $sequenceWord released for ${notifications.first().groupName}"
    }

    private fun buildBody(notifications: List<PendingReleaseNotification>): String {
        val count = notifications.size
        val sequenceWord = if (count == 1) "sequence was" else "sequences were"
        val lines = mutableListOf(
            "Hello ${notifications.first().approver},",
            "",
            "$count $sequenceWord successfully released for ${notifications.first().groupName}.",
            "",
        )

        notifications
            .groupBy { it.organism }
            .toSortedMap()
            .forEach { (organism, organismNotifications) ->
                lines += organism
                organismNotifications
                    .sortedWith(compareBy({ it.accessionVersion.accession }, { it.accessionVersion.version }))
                    .take(MAX_ACCESSIONS_IN_EMAIL)
                    .forEach { lines += "- ${it.accessionVersion.accession}.${it.accessionVersion.version}" }
                if (organismNotifications.size > MAX_ACCESSIONS_IN_EMAIL) {
                    lines += "- …and ${organismNotifications.size - MAX_ACCESSIONS_IN_EMAIL} more"
                }
                lines += "${backendConfig.websiteUrl}/$organism/submission/${notifications.first().groupId}/released"
                lines += ""
            }

        lines += "This message was sent to the user who approved the release and copied to the group's contact email."
        return lines.joinToString("\n")
    }

    private companion object {
        const val MAX_ACCESSIONS_IN_EMAIL = 100
    }
}
