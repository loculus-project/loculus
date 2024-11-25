<#ftl output_format="plainText">

<#if firstName?? && lastName??>
    ${kcSanitize(msg("orgInviteBodyPersonalized", link, linkExpiration, env.PROJECT_NAME, organization.name, linkExpirationFormatter(linkExpiration), firstName, lastName))}
<#else>
    ${kcSanitize(msg("orgInviteBody", link, linkExpiration, env.PROJECT_NAME, organization.name, linkExpirationFormatter(linkExpiration)))}
</#if>

