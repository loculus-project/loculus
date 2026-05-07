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
            "Fetched ${citations.size} citation(s) across ${citationsByDOI.size} SeqSet DOI(s) from Crossref."
        }

        if (citationsByDOI.isEmpty()) {
            return
        }
        val updateResult = seqSetCitationsDatabaseService.updateSeqSetCitations(citationsByDOI)

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
