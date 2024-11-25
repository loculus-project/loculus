<#import "template.ftl" as layout>
<@layout.emailLayout>
${kcSanitize(msg("emailTestBodyHtml",env.PROJECT_NAME))?no_esc}
</@layout.emailLayout>
