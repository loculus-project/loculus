<#import "template.ftl" as layout>
<@layout.emailLayout>
<#if firstName?? && lastName??>
    ${kcSanitize(msg("orgInviteBodyPersonalizedHtml", link, linkExpiration, env.PROJECT_NAME, organization.name, linkExpirationFormatter(linkExpiration), firstName, lastName))?no_esc}
<#else>
    ${kcSanitize(msg("orgInviteBodyHtml", link, linkExpiration, env.PROJECT_NAME, organization.name, linkExpirationFormatter(linkExpiration)))?no_esc}
</#if>
</@layout.emailLayout>
