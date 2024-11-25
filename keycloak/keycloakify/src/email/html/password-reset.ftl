<#import "template.ftl" as layout>
<@layout.emailLayout>
${kcSanitize(msg("passwordResetBodyHtml",link, linkExpiration, env.PROJECT_NAME, linkExpirationFormatter(linkExpiration)))?no_esc}
</@layout.emailLayout>
