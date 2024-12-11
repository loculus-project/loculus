package org.loculus.backend.utils

import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import mu.KotlinLogging
import org.loculus.backend.service.submission.RawProcessedData

private val log = KotlinLogging.logger { }

/**
 * Calculate the earliest release date for rows of sequence entries given to it one by one.
 * Assumes that rows are sorted: all accession entries are given in a block, and with ascending versions.
 *
 * The earliest release date of a sequence is the earliest date of:
 * - the internal release date
 * - any date from a given list of fields
 * - the earliest release date from the previous version (if it exists)
 */
class EarliestReleaseDateFinder(private val fields: List<String>) {
    private val earliestReleaseDateCache = mutableMapOf<String, LocalDateTime>()
    private var previousRawProcessedData: RawProcessedData? = null

    fun calculateEarliestReleaseDate(rawProcessedData: RawProcessedData): LocalDateTime {
        assert(previousRawProcessedData == null ||
                rawProcessedData.accession > previousRawProcessedData!!.accession ||
                (rawProcessedData.accession == previousRawProcessedData!!.accession &&
                        rawProcessedData.version > previousRawProcessedData!!.version)) {
            "Input is not ordered. Current: ${rawProcessedData.accession}.${rawProcessedData.version}, " +
                    "Previous: ${previousRawProcessedData!!.accession}.${previousRawProcessedData!!.version}"
        }

        var earliestReleaseDate = rawProcessedData.releasedAtTimestamp

        fields.forEach { field ->
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

        previousRawProcessedData = rawProcessedData

        return earliestReleaseDate
    }
}
