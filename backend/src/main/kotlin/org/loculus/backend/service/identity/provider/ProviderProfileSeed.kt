package org.loculus.backend.service.identity.provider

/** Initial import only, not a synchronization instruction. Null optional fields are allowed for service accounts. */
data class ProviderProfileSeed(
    val username: String?,
    val givenName: String? = null,
    val familyName: String? = null,
    val affiliation: String? = null,
    val orcidId: String? = null,
    val email: String? = null,
    val emailVerified: Boolean? = null,
)
