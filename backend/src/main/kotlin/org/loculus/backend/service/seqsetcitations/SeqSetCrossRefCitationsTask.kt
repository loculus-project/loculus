package org.loculus.backend.service.seqsetcitations

import org.loculus.backend.api.SeqSetCitationSource
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.ENABLE_SEQSETS_TRUE_VALUE
import org.loculus.backend.service.crossref.CrossRefService
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

private val log = mu.KotlinLogging.logger {}

internal fun mergeCitationSources(citationSources: List<SeqSetCitationSource>): Set<SeqSetCitationSource> {
    val mergedSources = mutableMapOf<String, SeqSetCitationSource>()

    for (citationSource in citationSources) {
        val existingSource = mergedSources[citationSource.source.sourceDOI]
        if (existingSource != null &&
            existingSource.source != citationSource.source
        ) {
            log.warn {
                "Conflicting CrossRef metadata for citation source ${citationSource.source.sourceDOI} (keeping latest): $existingSource and $citationSource"
            }
        }
        mergedSources[citationSource.source.sourceDOI] = citationSource.copy(
            seqSetDOIs = existingSource?.seqSetDOIs.orEmpty() + citationSource.seqSetDOIs,
        )
    }
    return mergedSources.values.toSet()
}

@Component
@ConditionalOnProperty(BackendSpringProperty.ENABLE_SEQSETS, havingValue = ENABLE_SEQSETS_TRUE_VALUE)
class SeqSetCrossRefCitationsTask(
    private val crossRefService: CrossRefService,
    private val seqSetCitationsDatabaseService: SeqSetCitationsDatabaseService,
) {
    /**
     * Runs every six hours, with an initial delay of one minute.
     * Adds citation sources from CrossRef, and connects to SeqSets via their DOI.
     */
    @Scheduled(
        initialDelay = 1,
        fixedDelay = 360,
        timeUnit = java.util.concurrent.TimeUnit.MINUTES,
    )
    fun task() {
        log.info { "Updating SeqSet CrossRef citations..." }

        if (!crossRefService.isActive) {
            log.info { "CrossRef service is not active, skipping SeqSet citation update." }
            return
        }

        val doiPrefix = crossRefService.doiPrefix
        if (doiPrefix.isNullOrBlank()) {
            log.info { "CrossRef service has no DOI prefix, skipping SeqSet citation update." }
            return
        }

        log.info { "Fetching CrossRef citations for DOI prefix: $doiPrefix" }
        val citationSources = mergeCitationSources(crossRefService.getCrossRefCitedBy(doiPrefix))
        val seqSetDOIs = citationSources.flatMap { it.seqSetDOIs }.toSet()
        log.info {
            "Fetched ${citationSources.size} citation source(s) from CrossRef covering ${seqSetDOIs.size} SeqSet DOI(s)."
        }
        if (citationSources.isEmpty()) return

        val updateResult = seqSetCitationsDatabaseService.updateCitationSourcesFromCrossRef(citationSources)
        if (updateResult.updatedCitationSourceDOIs.isNotEmpty()) {
            log.info { "Updated ${updateResult.updatedCitationSourceDOIs.size} citation source(s)." }
        }
        val skippedCitationSources = citationSources.size - updateResult.updatedCitationSourceDOIs.size
        if (skippedCitationSources > 0) {
            log.warn { "Skipped $skippedCitationSources citation source(s) with no matching SeqSet." }
        }
    }
}
