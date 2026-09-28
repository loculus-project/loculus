package org.loculus.backend.query.index

import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.health.contributor.Health
import org.springframework.boot.health.contributor.HealthIndicator
import org.springframework.stereotype.Component

/**
 * Part of the readiness group (application.properties), not of liveness: a pod only receives traffic once every
 * organism's index is loaded, instead of answering 503 "initializing" for the first seconds after each start.
 * Only the first load counts: a later reload (which drops the organism's index and answers 503 meanwhile) happens
 * on every replica at once, so gating readiness on it would take all of them out of service together.
 * Always registered (UP when the query engine is disabled) because health groups must name existing contributors.
 */
@Component
class QueryIndexHealthIndicator(private val service: ObjectProvider<QueryIndexService>) : HealthIndicator {
    override fun health(): Health {
        val missing = service.ifAvailable?.organismsNotLoaded() ?: emptyList()
        return if (missing.isEmpty()) {
            Health.up().build()
        } else {
            Health.outOfService().withDetail("loading", missing).build()
        }
    }
}
