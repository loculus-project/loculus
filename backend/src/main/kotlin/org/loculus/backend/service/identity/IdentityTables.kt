package org.loculus.backend.service.identity

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.java.javaUUID
import org.jetbrains.exposed.v1.datetime.datetime

const val LOCULUS_USERS_TABLE_NAME = "loculus_users"
const val EXTERNAL_IDENTITIES_TABLE_NAME = "external_identities"
const val IDENTITY_UNIQUE_CONSTRAINT = "external_identities_issuer_subject_key"
const val USERNAME_UNIQUE_CONSTRAINT = "loculus_users_username_lower_key"

object LoculusUsersTable : Table(LOCULUS_USERS_TABLE_NAME) {
    val id = javaUUID("id")

    // Seeded once and immutable; application ownership and permissions still use id.
    val username = text("username")
    val givenName = text("given_name").nullable()
    val familyName = text("family_name").nullable()
    val affiliation = text("affiliation").nullable()
    val orcidId = text("orcid_id").nullable()
    val provisionedAt = datetime("provisioned_at")
    override val primaryKey = PrimaryKey(id)
}

object ExternalIdentitiesTable : Table(EXTERNAL_IDENTITIES_TABLE_NAME) {
    val issuer = text("issuer")
    val subject = text("subject")
    val userId = javaUUID("user_id").references(LoculusUsersTable.id)
    val linkedAt = datetime("linked_at")
    override val primaryKey = PrimaryKey(issuer, subject, name = IDENTITY_UNIQUE_CONSTRAINT)
}
