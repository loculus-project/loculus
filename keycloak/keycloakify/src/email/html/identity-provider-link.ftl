<#import "template.ftl" as layout>
<@layout.emailLayout>
${kcSanitize(msg("identityProviderLinkBodyHtml", identityProviderDisplayName, env.PROJECT_NAME, identityProviderContext.username, link, linkExpiration, linkExpirationFormatter(linkExpiration)))?no_esc}
</@layout.emailLayout>
