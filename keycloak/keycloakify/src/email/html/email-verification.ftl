<#import "template.ftl" as layout>
<@layout.emailLayout>
${kcSanitize(msg("emailVerificationBodyHtml",link, linkExpiration, realmName, linkExpirationFormatter(linkExpiration), user.getUsername(), user.getEmail(), user.getFirstName(), user.getLastName(), user.getId(), user.getCreatedTimestamp()))?no_esc}
</@layout.emailLayout>
