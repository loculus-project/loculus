package org.loculus.backend.service.submission

import com.fasterxml.jackson.databind.ObjectMapper
import mu.KotlinLogging
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.concurrent.ConcurrentHashMap
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

private val log = KotlinLogging.logger { }

private val ALERT_REPEAT_INTERVAL = 24.hours

/**
 * Posts to the Slack incoming webhook from the `slack-notifications` secret when a quota passes a threshold.
 * Each quota and threshold alerts at most once per 24h per backend instance; a restart may repeat an alert.
 */
@Component
class RateLimitAlertNotifier(
    @Value("\${slack.hook:}") private val slackHookUrl: String,
    private val objectMapper: ObjectMapper,
    private val dateProvider: DateProvider,
) {
    private val httpClient = HttpClient.newHttpClient()
    private val lastSent = ConcurrentHashMap<String, Instant>()

    fun notify(quotaDescription: String, thresholdPercent: Int, used: Long, limit: Long) {
        val now = dateProvider.getCurrentInstant()
        val key = "$quotaDescription:$thresholdPercent"
        val previous = lastSent[key]
        if (previous != null && now - previous < ALERT_REPEAT_INTERVAL) {
            return
        }
        lastSent[key] = now

        val text = if (thresholdPercent >= 100) {
            ":rotating_light: Rate limit reached: the daily quota $quotaDescription is used up " +
                "($used of $limit in the last 24 hours). Further write requests are rejected with 429."
        } else {
            ":warning: Rate limit at $thresholdPercent%: the daily quota $quotaDescription is at $used of $limit " +
                "in the last 24 hours."
        }
        log.warn { text }
        if (slackHookUrl.isBlank()) {
            return
        }
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
