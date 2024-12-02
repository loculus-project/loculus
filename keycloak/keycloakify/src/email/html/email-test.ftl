<#import "template.ftl" as layout>
<@layout.emailLayout>
${kcSanitize(msg("emailTestBodyHtml",properties.projectName))?no_esc}
</@layout.emailLayout>
