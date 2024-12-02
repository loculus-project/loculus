<#import "template.ftl" as layout>
<@layout.emailLayout>
${kcSanitize(msg("emailVerificationBodyHtml",link, linkExpiration, properties.projectName, linkExpirationFormatter(linkExpiration)))?no_esc}
</@layout.emailLayout>
