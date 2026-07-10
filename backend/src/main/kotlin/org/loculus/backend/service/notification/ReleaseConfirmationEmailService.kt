package org.loculus.backend.service.notification

import jakarta.mail.internet.InternetAddress
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
    init {
        validateConfiguredAddress("from", from, required = true)
        validateConfiguredAddress("reply-to", replyTo, required = false)
    }

    fun sendReleaseConfirmation(
        recipientEmail: String,
        ccEmail: String?,
        approver: String,
        groupId: Int,
        content: ReleaseNotificationContent,
        messageId: String,
    ) {
        require(content.totalCount > 0) { "Cannot send an empty release confirmation" }

        val message = mailSender.createMimeMessage()
        populateMessage(message, recipientEmail, ccEmail, approver, groupId, content, messageId)
        mailSender.send(message)
    }

    private fun populateMessage(
        message: MimeMessage,
        recipientEmail: String,
        ccEmail: String?,
        approver: String,
        groupId: Int,
        content: ReleaseNotificationContent,
        messageId: String,
    ) {
        val helper = MimeMessageHelper(message, false, StandardCharsets.UTF_8.name())
        helper.setFrom(from)
        helper.setTo(recipientEmail)
        if (ccEmail != null) {
            helper.setCc(ccEmail)
        }
        if (replyTo.isNotBlank()) {
            helper.setReplyTo(replyTo)
        }
        helper.setSubject(buildSubject(content))
        helper.setText(buildBody(approver, groupId, content, copiedToGroup = ccEmail != null), false)
        message.setHeader("Message-ID", messageId)
    }

    private fun buildSubject(content: ReleaseNotificationContent): String {
        val count = content.totalCount
        val sequenceWord = if (count == 1L) "sequence" else "sequences"
        return "Loculus: $count $sequenceWord released for ${content.groupName}"
    }

    private fun buildBody(
        approver: String,
        groupId: Int,
        content: ReleaseNotificationContent,
        copiedToGroup: Boolean,
    ): String {
        val count = content.totalCount
        val sequenceWord = if (count == 1L) "sequence was" else "sequences were"
        val lines = mutableListOf(
            "Hello $approver,",
            "",
            "$count $sequenceWord successfully released for ${content.groupName}.",
            "",
        )

        content.organisms
            .sortedBy { it.organism }
            .forEach { organismSummary ->
                lines += organismSummary.organism
                val displayedAccessions = organismSummary.accessionVersions
                    .sortedWith(compareBy({ it.accession }, { it.version }))
                    .take(MAX_ACCESSIONS_IN_EMAIL)
                displayedAccessions.forEach { lines += "- ${it.accession}.${it.version}" }
                val omittedCount = organismSummary.count - displayedAccessions.size.toLong()
                if (omittedCount > 0) {
                    lines += "- …and $omittedCount more"
                }
                lines += "${backendConfig.websiteUrl}/${organismSummary.organism}/submission/$groupId/released"
                lines += ""
            }

        lines += if (copiedToGroup) {
            "This message was sent to the user who approved the release and copied to the group's contact email."
        } else {
            "This message was sent to the user who approved the release."
        }
        return lines.joinToString("\n")
    }

    private fun validateConfiguredAddress(propertyName: String, value: String, required: Boolean) {
        if (!required && value.isBlank()) return
        require(value.isNotBlank()) { "Release-confirmation email $propertyName address must not be blank" }
        require(
            runCatching {
                InternetAddress.parse(value, true).single().validate()
            }.isSuccess,
        ) { "Release-confirmation email $propertyName address is invalid" }
    }

    private companion object {
        const val MAX_ACCESSIONS_IN_EMAIL = 100
    }
}
