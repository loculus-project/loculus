package org.loculus.backend.utils

import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime

fun LocalDateTime.toTimestamp() = this.toInstant(TimeZone.UTC).epochSeconds

fun LocalDateTime.toUtcDateString(): String = this.toInstant(TimeZone.currentSystemDefault())
    .toLocalDateTime(TimeZone.UTC)
    .date
    .toString()
