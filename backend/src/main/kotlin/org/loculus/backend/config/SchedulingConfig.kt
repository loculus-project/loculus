package org.loculus.backend.config

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling

/**
 * Keeps production scheduling enabled while allowing integration tests to rule
 * out scheduled database work as a source of interference.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(
    name = [BackendSpringProperty.SCHEDULING_ENABLED],
    havingValue = "true",
    matchIfMissing = true,
)
class SchedulingConfig
