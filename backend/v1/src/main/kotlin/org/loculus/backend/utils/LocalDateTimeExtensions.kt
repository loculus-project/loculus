package org.loculus.backend.utils

import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime

fun LocalDateTime.toTimestamp() = this.toInstant(DateProvider.timeZone).epochSeconds

fun LocalDateTime.toUtcDateString(): String = this.toInstant(DateProvider.timeZone)
    .toLocalDateTime(DateProvider.timeZone)
    .date
    .toString()
