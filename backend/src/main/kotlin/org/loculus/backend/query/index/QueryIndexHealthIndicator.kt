package org.loculus.backend.query.index

import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.health.contributor.Health
import org.springframework.boot.health.contributor.HealthIndicator
import org.springframework.stereotype.Component

/**
 * Part of the readiness group (application.properties), not of liveness: a pod only receives traffic once every
 * organism's index is loaded, instead of answering 503 "initializing" for the first seconds after each start.
 * Only the first load counts: a later reload (which drops the organism's index; requests wait for it meanwhile) happens
 * on every replica at once, so gating readiness on it would take all of them out of service together.
 * An organism of the backend config without a query schema keeps the pod out of service for good: it would answer 404
 * "Unknown organism" for that organism (image and chart out of step during a rollout), and the old pod should keep
 * serving instead.
 * Always registered (UP when the query engine is disabled) because health groups must name existing contributors.
 */
@Component
class QueryIndexHealthIndicator(private val service: ObjectProvider<QueryIndexService>) : HealthIndicator {
    override fun health(): Health {
        val service = service.ifAvailable ?: return Health.up().build()
        val notQueryable = service.organismsNotQueryable()
        val loading = service.organismsNotLoaded()
        if (notQueryable.isEmpty() && loading.isEmpty()) return Health.up().build()
        val health = Health.outOfService()
        if (notQueryable.isNotEmpty()) health.withDetail("notQueryable", notQueryable)
        if (loading.isNotEmpty()) health.withDetail("loading", loading)
        return health.build()
    }
}
