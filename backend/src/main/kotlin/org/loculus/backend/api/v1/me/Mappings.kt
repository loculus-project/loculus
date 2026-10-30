package org.loculus.backend.api.v1.me

import kotlinx.datetime.toInstant
import org.loculus.backend.auth.LoculusPrincipal
import org.loculus.backend.utils.DateProvider

fun LoculusPrincipal.toResponse(): MeResponse =
    MeResponse(userId, provisionedAt.toInstant(DateProvider.timeZone).toString())
