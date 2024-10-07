package org.loculus.backend.utils

import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import org.springframework.stereotype.Component

@Component
class DateProvider {
    fun getCurrentInstant() = Clock.System.now()

    fun getCurrentDateTime() = getCurrentInstant().toLocalDateTime(TimeZone.UTC)

    fun getCurrentDate() = getCurrentDateTime().date
}
