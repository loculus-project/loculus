package org.loculus.backend.service.seqsetcitations

import org.loculus.backend.api.CitationOrigin
import org.loculus.backend.api.SeqSetCitingSource
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.ENABLE_SEQSETS_TRUE_VALUE
import org.loculus.backend.service.crossref.CrossRefService
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

private val log = mu.KotlinLogging.logger {}

private fun mergeCitingSources(citationsByDOI: Map<String, List<SeqSetCitingSource>>): Set<SeqSetCitingSource> {
    val merged = mutableMapOf<String, SeqSetCitingSource>()

    for ((seqSetDOI, citingSources) in citationsByDOI) {
        for (incoming in citingSources) {
            val existing = merged[incoming.sourceDOI]
            if (existing == null) {
                merged[incoming.sourceDOI] = incoming.copy(seqSetDOIs = setOf(seqSetDOI))
                continue
            }
            if (existing.copy(seqSetDOIs = emptySet()) != incoming.copy(seqSetDOIs = emptySet())) {
                log.warn {
                    "Conflicting CrossRef metadata for citing source ${incoming.sourceDOI}: $existing and $incoming"
                }
            }
            merged[incoming.sourceDOI] = existing.copy(
                seqSetDOIs = existing.seqSetDOIs + seqSetDOI,
            )
        }
    }
    return merged.values.toSet()
}

@Component
@ConditionalOnProperty(BackendSpringProperty.ENABLE_SEQSETS, havingValue = ENABLE_SEQSETS_TRUE_VALUE)
class UpdateSeqSetCitationsTask(
    private val crossRefService: CrossRefService,
    private val seqSetCitationsDatabaseService: SeqSetCitationsDatabaseService,
) {
    /**
     * Runs every hour, with an initial delay of one minute.
     * Adds citing sources from Crossref, and connects to SeqSets via their DOI.
     */
    @Scheduled(
        initialDelay = 1,
        fixedDelay = 60,
        timeUnit = java.util.concurrent.TimeUnit.MINUTES,
    )
    fun task() {
        log.info { "Updating SeqSet citations..." }

        if (!crossRefService.isActive) {
            log.info { "Crossref service is not active, skipping SeqSet citation update." }
            return
        }

        val doiPrefix = crossRefService.doiPrefix
        if (doiPrefix.isNullOrBlank()) {
            log.info { "Crossref service has no DOI prefix, skipping SeqSet citation update." }
            return
        }

        log.info { "Fetching Crossref citations for DOI prefix: $doiPrefix" }
        val citationsByDOI = crossRefService.getCrossRefCitedBy(doiPrefix)
        val citingSources = mergeCitingSources(citationsByDOI)
        log.info {
            "Fetched ${citingSources.size} citation(s) across ${citationsByDOI.size} SeqSet DOI(s) from Crossref."
        }

        if (citingSources.isEmpty()) return

        val updateResult = seqSetCitationsDatabaseService.updateSeqSetCitingSources(
            citingSources,
            CitationOrigin.CROSSREF,
        )

        if (updateResult.updatedSeqSetDOIs.isNotEmpty()) {
            log.info { "Successfully updated citation(s) for ${updateResult.updatedSeqSetDOIs.size} SeqSet DOI(s)." }
        }

        if (updateResult.skippedSeqSetDOIs.isNotEmpty()) {
            log.warn {
                "Skipped ${updateResult.skippedSeqSetDOIs.size} SeqSet DOI(s) that do not appear in the database."
            }
        }
    }
}
