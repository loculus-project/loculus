import { i18nBuilder } from "keycloakify/login";
import type { ThemeName } from "../kc.gen";

/** @see: https://docs.keycloakify.dev/i18n */
const { useI18n, ofTypeI18n } = i18nBuilder
    .withThemeName<ThemeName>()
    .withCustomTranslations({
        en: {
            termsTitle:
                "Do you accept the " +
                "<a href='https://pathoplexus.org/about/terms-of-use/terms-of-service'>Terms of Service</a> and " +
                "<a href='https://pathoplexus.org/about/terms-of-use/privacy-policy'>Privacy Policy</a>?",
            termsText: "",
            acceptTerms: "I agree to the Terms of Service and Privacy Policy"
        }
    })
    .build();

type I18n = typeof ofTypeI18n;

export { useI18n, type I18n };
