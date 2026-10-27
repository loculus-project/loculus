package org.loculus.backend.api.v1.me

import io.swagger.v3.oas.annotations.media.Schema
import java.util.UUID

data class MeResponse(
    @Schema(description = "Immutable internal Loculus user ID (UUID v4).", format = "uuid")
    val userId: UUID,
    @Schema(description = "UTC time the account was provisioned into Loculus.", format = "date-time")
    val provisionedAt: String,
)
