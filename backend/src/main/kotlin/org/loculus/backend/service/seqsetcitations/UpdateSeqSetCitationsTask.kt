package org.loculus.backend.service.seqsetcitations

import org.loculus.backend.service.crossref.CrossRefService
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

private val log = mu.KotlinLogging.logger {}

@Component
class UpdateSeqSetCitationsTask(
    private val crossRefService: CrossRefService,
    private val seqSetCitationsDatabaseService: SeqSetCitationsDatabaseService,
) {
    /**
     * Runs every hour, with an initial delay of one minute.
     * Resets citations for each seqSet DOI with citations fetched from Crossref.
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
        val citations = crossRefService.getCrossRefCitedBy(doiPrefix)
        val citationsByDOI = citations.groupBy { it.seqSetDOI }
        log.info {
            "Successfully fetched ${citations.size} citations for ${citationsByDOI.size} SeqSet DOIs from Crossref."
        }

        seqSetCitationsDatabaseService.updateSeqSetCitations(citationsByDOI)
        log.info { "Successfully updated SeqSet citations." }
    }
}
