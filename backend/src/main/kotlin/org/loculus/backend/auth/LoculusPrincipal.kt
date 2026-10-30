package org.loculus.backend.auth

import kotlinx.datetime.LocalDateTime
import java.util.UUID

/** The exact identity used for this request, not an arbitrary identity linked to the user. */
data class ExternalIdentity(val issuer: String, val subject: String)

/** Internal application identity. API responses must explicitly map the fields they expose. */
data class LoculusPrincipal(
    val userId: UUID,
    /** UTC time the user was provisioned into Loculus, not created at the identity provider. */
    val provisionedAt: LocalDateTime,
    val externalIdentity: ExternalIdentity,
)
