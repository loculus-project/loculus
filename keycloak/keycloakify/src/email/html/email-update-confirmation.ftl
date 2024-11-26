<#import "template.ftl" as layout>
<@layout.emailLayout>
${kcSanitize(msg("emailUpdateConfirmationBodyHtml",link, newEmail, properties.projectName, linkExpirationFormatter(linkExpiration)))?no_esc}
</@layout.emailLayout>
