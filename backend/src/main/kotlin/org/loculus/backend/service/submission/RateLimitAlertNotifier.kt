package org.loculus.backend.service.submission

import com.fasterxml.jackson.databind.ObjectMapper
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.v1.core.IntegerColumnType
import org.jetbrains.exposed.v1.core.TextColumnType
import org.jetbrains.exposed.v1.core.statements.StatementType
import org.jetbrains.exposed.v1.datetime.KotlinLocalDateTimeColumnType
import org.jetbrains.exposed.v1.jdbc.transactions.TransactionManager
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import kotlin.time.Duration.Companion.hours

private val log = KotlinLogging.logger { }

private val ALERT_REPEAT_INTERVAL = 24.hours

const val RATE_LIMIT_ALERTS_TABLE_NAME = "rate_limit_alerts"

/**
 * Posts to the Slack incoming webhook from the `slack-notifications` secret when a quota passes a threshold,
 * at most once per quota and threshold per 24h across all backend instances.
 */
@Component
class RateLimitAlertNotifier(
    @Value("\${slack.hook:}") private val slackHookUrl: String,
    private val objectMapper: ObjectMapper,
    private val dateProvider: DateProvider,
) {
    private val httpClient = HttpClient.newHttpClient()

    /**
     * Runs in its own transaction: the 100% alert is raised while the rejected request's transaction rolls back,
     * which would otherwise undo the record and alert again on every rejection.
     * Returns whether the alert was sent (false if it was already sent within the last 24h).
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun notify(quotaKey: String, quotaDescription: String, thresholdPercent: Int, used: Long, limit: Long): Boolean {
        if (!claimAlert(quotaKey, thresholdPercent)) {
            return false
        }

        val text = if (thresholdPercent >= 100) {
            ":rotating_light: Rate limit reached: the daily quota $quotaDescription is used up " +
                "($used of $limit in the last 24 hours). Further write requests are rejected with 429."
        } else {
            ":warning: Rate limit at $thresholdPercent%: the daily quota $quotaDescription is at $used of $limit " +
                "in the last 24 hours."
        }
        log.warn { text }
        if (slackHookUrl.isNotBlank()) {
            send(text)
        }
        return true
    }

    /** Records the alert unless it was sent within the last 24h; concurrent callers cannot both claim it. */
    private fun claimAlert(quotaKey: String, thresholdPercent: Int): Boolean {
        val now = dateProvider.getCurrentInstant()
        val sql = """
            INSERT INTO $RATE_LIMIT_ALERTS_TABLE_NAME (quota, threshold_percent, sent_at)
            VALUES (?, ?, ?)
            ON CONFLICT (quota, threshold_percent) DO UPDATE SET sent_at = EXCLUDED.sent_at
            WHERE $RATE_LIMIT_ALERTS_TABLE_NAME.sent_at < ?
            RETURNING 1
        """.trimIndent()
        return TransactionManager.current().exec(
            sql,
            listOf(
                TextColumnType() to quotaKey,
                IntegerColumnType() to thresholdPercent,
                KotlinLocalDateTimeColumnType() to now.toLocalDateTime(DateProvider.timeZone),
                KotlinLocalDateTimeColumnType() to (now - ALERT_REPEAT_INTERVAL).toLocalDateTime(DateProvider.timeZone),
            ),
            explicitStatementType = StatementType.SELECT,
        ) { it.next() } ?: false
    }

    private fun send(text: String) {
        val request = HttpRequest.newBuilder(URI.create(slackHookUrl))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(mapOf("text" to text))))
            .build()
        httpClient.sendAsync(request, HttpResponse.BodyHandlers.discarding())
            .whenComplete { response, error ->
                if (error != null || response.statusCode() !in 200..299) {
                    log.error(error) { "Failed to send rate limit alert to Slack: ${response?.statusCode()}" }
                }
            }
    }
}
