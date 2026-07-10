package org.loculus.backend.service.notification

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
            try {
                val recipientEmail = getApproverEmail(batchKey.approver)
                val messageId = "<release-${UUID.randomUUID()}@loculus>"
                emailService.sendReleaseConfirmation(
                    recipientEmail = recipientEmail,
                    ccEmail = notifications.first().groupContactEmail,
                    notifications = notifications,
                    messageId = messageId,
                )
                databaseService.markNotificationsAsSent(
                    notifications.map { SentReleaseNotification(it, recipientEmail) },
                    messageId,
                )
                log.info {
                    "Sent release confirmation for ${notifications.size} sequence(s) to ${batchKey.approver} " +
                        "for group ${batchKey.groupId}"
                }
            } catch (exception: Exception) {
                log.error(exception) {
                    "Failed to send release confirmation to ${batchKey.approver} for group ${batchKey.groupId}; " +
                        "the notification will be retried"
                }
            }
        }
    }

    private fun getApproverEmail(username: String): String {
        val user = keycloakAdapter.getUsersWithName(username).singleOrNull { it.username == username }
            ?: throw IllegalStateException("Could not find exactly one Keycloak user named '$username'")
        return user.email?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("Keycloak user '$username' does not have an email address")
    }

    private data class ReleaseNotificationBatchKey(val approver: String, val groupId: Int)
}
