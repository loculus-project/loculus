<#import "template.ftl" as layout>
<@layout.emailLayout>
${kcSanitize(msg("emailUpdateConfirmationBodyHtml",link, newEmail, env.PROJECT_NAME, linkExpirationFormatter(linkExpiration)))?no_esc}
</@layout.emailLayout>
