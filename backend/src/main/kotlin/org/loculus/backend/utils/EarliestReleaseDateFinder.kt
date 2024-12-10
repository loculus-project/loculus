package org.loculus.backend.utils

import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import mu.KotlinLogging
import org.loculus.backend.config.EarliestReleaseDate
import org.loculus.backend.service.submission.RawProcessedData

private val log = KotlinLogging.logger { }

class EarliestReleaseDateFinder(private val useEarliestReleaseDate: EarliestReleaseDate) {
    private val earliestReleaseDateCache = mutableMapOf<String, LocalDateTime>()

    fun calculateEarliestReleaseDate(rawProcessedData: RawProcessedData): LocalDateTime? {
        if (!useEarliestReleaseDate.enabled) {
            return null
        }

        var earliestReleaseDate = rawProcessedData.releasedAtTimestamp

        useEarliestReleaseDate.externalFields.forEach { field ->
            rawProcessedData.processedData.metadata[field]?.textValue()?.let { dateText ->
                val date = try {
                    LocalDateTime(LocalDate.parse(dateText), LocalTime.fromSecondOfDay(0))
                } catch (e: IllegalArgumentException) {
                    log.warn {
                        "Incorrectly formatted date on ${rawProcessedData.accession}." +
                            "${rawProcessedData.version} on field $field: $dateText"
                    }
                    null
                }
                if (date != null) {
                    earliestReleaseDate = if (date < earliestReleaseDate) date else earliestReleaseDate
                }
            }
        }

        earliestReleaseDateCache[rawProcessedData.accession]?.let { cached ->
            if (cached < earliestReleaseDate) {
                earliestReleaseDate = cached
            } else {
                earliestReleaseDateCache[rawProcessedData.accession] = earliestReleaseDate
            }
        } ?: run {
            earliestReleaseDateCache.clear() // Inputs are ordered; no need for previous values
            earliestReleaseDateCache[rawProcessedData.accession] = earliestReleaseDate
        }

        return earliestReleaseDate
    }
}
