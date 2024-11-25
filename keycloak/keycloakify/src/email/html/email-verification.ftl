<#import "template.ftl" as layout>
<@layout.emailLayout>
${kcSanitize(msg("emailVerificationBodyHtml",link, linkExpiration, env.PROJECT_NAME, linkExpirationFormatter(linkExpiration)))?no_esc}
</@layout.emailLayout>
