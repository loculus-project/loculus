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
        )
        buildKindBreakdown(content.kindCounts)?.let { lines += it }
        lines += ""

        content.organisms.forEach { organismSummary ->
            lines += organismSummary.organism
            organismSummary.accessions.forEach { lines += "- ${formatAccession(it)}" }
            val omittedCount = organismSummary.count - organismSummary.accessions.size.toLong()
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

    private fun formatAccession(released: ReleasedAccessionVersion): String {
        val accessionVersion = "${released.accessionVersion.accession}.${released.accessionVersion.version}"
        return when (released.kind) {
            ReleaseKind.NEW -> accessionVersion
            ReleaseKind.REVISION -> "$accessionVersion (revision)"
            ReleaseKind.REVOCATION -> "$accessionVersion (revocation)"
        }
    }

    /**
     * Summarizes the release by kind, e.g. "This included 2 new, 1 revised.". Returns null when everything is a new
     * submission, so the common case stays uncluttered.
     */
    private fun buildKindBreakdown(kindCounts: Map<ReleaseKind, Long>): String? {
        val newCount = kindCounts[ReleaseKind.NEW] ?: 0
        val revisedCount = kindCounts[ReleaseKind.REVISION] ?: 0
        val revokedCount = kindCounts[ReleaseKind.REVOCATION] ?: 0
        if (revisedCount == 0L && revokedCount == 0L) return null

        val parts = buildList {
            if (newCount > 0) add("$newCount new")
            if (revisedCount > 0) add("$revisedCount revised")
            if (revokedCount > 0) add("$revokedCount revoked")
        }
        return "This included ${parts.joinToString(", ")}."
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
}
