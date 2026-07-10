package org.loculus.backend.service.notification

import jakarta.mail.internet.AddressException
import jakarta.mail.internet.InternetAddress
import mu.KotlinLogging
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.RELEASE_CONFIRMATION_EMAILS_ENABLED_VALUE
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.service.scheduler.TaskLock
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.UUID
import java.util.concurrent.TimeUnit

private val log = KotlinLogging.logger {}

const val RELEASE_CONFIRMATION_EMAIL_TASK_NAME = "release-confirmation-email"

@Component
@ConditionalOnProperty(
    BackendSpringProperty.RELEASE_CONFIRMATION_EMAILS_ENABLED,
    havingValue = RELEASE_CONFIRMATION_EMAILS_ENABLED_VALUE,
)
class ReleaseConfirmationEmailTask(
    private val databaseService: ReleaseNotificationDatabaseService,
    private val emailService: ReleaseConfirmationEmailService,
    private val keycloakAdapter: KeycloakAdapter,
) {
    @Scheduled(
        fixedDelayString = "\${${BackendSpringProperty.RELEASE_CONFIRMATION_EMAILS_RUN_EVERY_SECONDS}}",
        timeUnit = TimeUnit.SECONDS,
    )
    @TaskLock(
        name = RELEASE_CONFIRMATION_EMAIL_TASK_NAME,
        intervalString = "\${${BackendSpringProperty.RELEASE_CONFIRMATION_EMAILS_RUN_EVERY_SECONDS}}",
    )
    fun task() {
        val batches = databaseService.getPendingReleaseNotifications().groupBy {
            ReleaseNotificationBatchKey(it.approver, it.groupId)
        }
        if (batches.isEmpty()) return

        log.info { "Sending ${batches.size} release confirmation email batch(es)" }
        batches.forEach { (batchKey, notifications) ->
            processBatch(batchKey, notifications)
        }
    }

    private fun processBatch(batchKey: ReleaseNotificationBatchKey, notifications: List<PendingReleaseNotification>) {
        try {
            val recipientEmail = getApproverEmail(batchKey.approver)
            val ccEmail = deriveCcEmail(
                recipientEmail = recipientEmail,
                groupContactEmail = notifications.first().groupContactEmail,
                groupId = batchKey.groupId,
            )
            val content = notifications.toContent()
            val messageId = "<release-${UUID.randomUUID()}@loculus>"

            emailService.sendReleaseConfirmation(
                recipientEmail = recipientEmail,
                ccEmail = ccEmail,
                approver = batchKey.approver,
                groupId = batchKey.groupId,
                content = content,
                messageId = messageId,
            )
            databaseService.deletePendingReleaseNotifications(notifications)
            log.info {
                "Sent release confirmation for ${notifications.size} sequence(s) to ${batchKey.approver} " +
                    "for group ${batchKey.groupId}"
            }
        } catch (exception: Exception) {
            log.error(exception) {
                "Failed to send release confirmation to ${batchKey.approver} for group ${batchKey.groupId}; " +
                    "the pending notifications will be retried"
            }
        }
    }

    private fun List<PendingReleaseNotification>.toContent(): ReleaseNotificationContent {
        val first = first()
        val organismSummaries = groupBy(PendingReleaseNotification::organism)
            .toSortedMap()
            .map { (organism, notifications) ->
                ReleaseNotificationOrganismSummary(
                    organism = organism,
                    count = notifications.size.toLong(),
                    accessionVersions = notifications
                        .map(PendingReleaseNotification::accessionVersion)
                        .sortedWith(compareBy({ it.accession }, { it.version }))
                        .take(MAX_ACCESSIONS_PER_ORGANISM),
                )
            }

        return ReleaseNotificationContent(
            groupName = first.groupName,
            groupContactEmail = first.groupContactEmail,
            totalCount = size.toLong(),
            organisms = organismSummaries,
        )
    }

    private fun getApproverEmail(username: String): String {
        val user = keycloakAdapter.getUsersWithName(username).singleOrNull { it.username == username }
            ?: throw IllegalStateException("Could not find exactly one Keycloak user named '$username'")
        val email = user.email?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("Keycloak user '$username' does not have an email address")
        parseSingleAddress(email)
            ?: throw IllegalStateException("Keycloak user '$username' does not have a valid email address")
        return email.trim()
    }

    private fun deriveCcEmail(recipientEmail: String, groupContactEmail: String, groupId: Int): String? {
        val candidate = groupContactEmail.trim()
        if (candidate.isEmpty()) {
            log.warn { "Group $groupId has a blank contact email; omitting it from the release confirmation" }
            return null
        }

        val parsedCc = parseSingleAddress(candidate)
        if (parsedCc == null) {
            log.warn { "Group $groupId has an invalid contact email; omitting it from the release confirmation" }
            return null
        }
        val parsedRecipient = parseSingleAddress(recipientEmail)
        if (parsedRecipient?.address.equals(parsedCc.address, ignoreCase = true)) return null

        return candidate
    }

    private fun parseSingleAddress(value: String): InternetAddress? = try {
        val parsedAddresses = InternetAddress.parse(value, true)
        parsedAddresses.singleOrNull()?.also { it.validate() }
    } catch (_: AddressException) {
        null
    }

    private data class ReleaseNotificationBatchKey(val approver: String, val groupId: Int)

    private companion object {
        const val MAX_ACCESSIONS_PER_ORGANISM = 100
    }
}
