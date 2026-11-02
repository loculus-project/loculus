package org.loculus.backend.maintenance

data class BackfillIssue(
    val reason: String,
    val membershipId: Int? = null,
    val groupId: Int? = null,
    val username: String? = null,
    val subject: String? = null,
)

data class IdentityBackfillReport(
    val mode: String,
    val issuer: String,
    var result: String = "RUNNING",
    var accountsScanned: Int = 0,
    var identitiesAlreadyPresent: Int = 0,
    var identitiesNeedingProvisioning: Int = 0,
    var identitiesEnsured: Int = 0,
    var membershipsAlreadyLinked: Int = 0,
    var membershipsToLink: Int = 0,
    var membershipsLinked: Int = 0,
    val issues: MutableList<BackfillIssue> = mutableListOf(),
) {
    fun exitCode() = when (result) {
        "COMPLETE" -> 0
        "INCOMPLETE" -> 2
        else -> 1
    }
}
