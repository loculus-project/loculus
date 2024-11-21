/* eslint-disable @typescript-eslint/ban-types */
import type { ExtendKcContext } from "keycloakify/login";
import type { KcContext as KcContext_base } from "keycloakify/login/KcContext";
import type { KcEnvName, ThemeName } from "../kc.gen";

export type KcContextExtension = {
    themeName: ThemeName;
    properties: Record<KcEnvName, string> & {};
    // NOTE: Here you can declare more properties to extend the KcContext
    // See: https://docs.keycloakify.dev/faq-and-help/some-values-you-need-are-missing-from-in-kccontext
};

export type KcContextExtensionPerPage = {
    "register.ftl": {
        social: KcContext_base.Login["social"];
    }
};

export type KcContext = ExtendKcContext<KcContextExtension, KcContextExtensionPerPage>;
