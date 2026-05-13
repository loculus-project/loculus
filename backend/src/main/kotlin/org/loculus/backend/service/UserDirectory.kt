package org.loculus.backend.service

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.ldap.core.AttributesMapper
import org.springframework.ldap.core.LdapTemplate
import org.springframework.ldap.core.support.LdapContextSource
import org.springframework.ldap.query.LdapQueryBuilder.query
import org.springframework.stereotype.Component
import javax.naming.directory.Attributes

@ConfigurationProperties(prefix = "loculus.ldap")
data class LdapProperties(
    val host: String,
    val port: Int = 3890,
    val baseDn: String,
    val userBaseDn: String,
    val groupBaseDn: String,
    val userFilter: String,
    val bindDn: String,
    val bindPassword: String,
)

/**
 * A user as Loculus needs to know about them — username, email, name, and the
 * "university / organisation" field surfaced by the user profile.
 */
data class LoculusUser(
    val username: String,
    val email: String?,
    val firstName: String?,
    val lastName: String?,
    val organization: String?,
)

@Component
class UserDirectory(private val props: LdapProperties) {

    private val ldapTemplate: LdapTemplate = LdapTemplate(
        LdapContextSource().apply {
            setUrl("ldap://${props.host}:${props.port}")
            userDn = props.bindDn
            password = props.bindPassword
            setBase(props.baseDn)
            afterPropertiesSet()
        },
    )

    /**
     * Look up a single user by their LDAP `uid`. Returns the matching user(s)
     * — typically zero or one entry.
     */
    fun getUsersWithName(username: String): List<LoculusUser> = ldapTemplate.search(
        query().base(props.userBaseDn).where("uid").`is`(username),
        UserAttributesMapper,
    )

    private object UserAttributesMapper : AttributesMapper<LoculusUser> {
        override fun mapFromAttributes(attrs: Attributes): LoculusUser = LoculusUser(
            username = attrs.get("uid")?.get()?.toString() ?: "",
            email = attrs.get("mail")?.get()?.toString(),
            firstName = attrs.get("givenName")?.get()?.toString(),
            lastName = attrs.get("sn")?.get()?.toString(),
            organization = attrs.get("o")?.get()?.toString()
                ?: attrs.get("organizationName")?.get()?.toString(),
        )
    }
}
