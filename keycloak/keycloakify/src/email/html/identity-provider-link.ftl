<#import "template.ftl" as layout>
<@layout.emailLayout>
${kcSanitize(msg("identityProviderLinkBodyHtml", identityProviderDisplayName, properties.projectName, identityProviderContext.username, link, linkExpiration, linkExpirationFormatter(linkExpiration)))?no_esc}
</@layout.emailLayout>
