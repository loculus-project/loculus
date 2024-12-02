<#ftl output_format="plainText">

<#if firstName?? && lastName??>
    ${kcSanitize(msg("orgInviteBodyPersonalized", link, linkExpiration, properties.projectName, organization.name, linkExpirationFormatter(linkExpiration), firstName, lastName))}
<#else>
    ${kcSanitize(msg("orgInviteBody", link, linkExpiration, properties.projectName, organization.name, linkExpirationFormatter(linkExpiration)))}
</#if>

