package org.loculus.backend.utils

import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import org.springframework.stereotype.Component
import kotlin.time.Clock

@Component
class DateProvider {
    fun getCurrentInstant() = Clock.System.now()

    fun getCurrentDateTime() = getCurrentInstant().toLocalDateTime(timeZone)

    fun getCurrentDate() = getCurrentDateTime().date

    companion object {
        val timeZone = TimeZone.UTC
    }
}
