import { useState } from "react";
import { clsx } from "keycloakify/tools/clsx";
import { UserProfileFormFields } from "keycloakify/login/pages/shared/UserProfileFormFields";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import { useGetClassName } from "keycloakify/login/lib/useGetClassName";
import type { KcContext } from "../kcContext";
import type { I18n } from "../i18n";
import AcceptanceOfTerms from "./AcceptanceOfTerms";

export default function IdpReviewUserProfile(props: PageProps<Extract<KcContext, { pageId: "idp-review-user-profile.ftl" }>, I18n>) {
    const { kcContext, i18n, doUseDefaultCss, Template, classes } = props;

    const { getClassName } = useGetClassName({
        doUseDefaultCss,
        classes
    });

    const { msg, msgStr } = i18n;

    const { url } = kcContext;

    const [isFormSubmittable, setIsFormSubmittable] = useState(false);
    const [didAgree, setDidAgree] = useState(false);

    return (
        <Template {...{ kcContext, i18n, doUseDefaultCss, classes }} headerNode={msg("loginIdpReviewProfileTitle")}>
            <form id="kc-idp-review-profile-form" className={getClassName("kcFormClass")} action={url.loginAction} method="post">
                <UserProfileFormFields
                    kcContext={kcContext}
                    onIsFormSubmittableValueChange={setIsFormSubmittable}
                    i18n={i18n}
                    getClassName={getClassName}
                />
                <div className={getClassName("kcFormGroupClass")}>
                    <AcceptanceOfTerms
                        termsMessage={kcContext.properties.REGISTRATION_TERMS_MESSAGE || ''}
                        onAgreeChange={setDidAgree}
                    />
                    <div id="kc-form-options" className={getClassName("kcFormOptionsClass")}>
                        <div className={getClassName("kcFormOptionsWrapperClass")} />
                    </div>
                    <div id="kc-form-buttons" className={getClassName("kcFormButtonsClass")}>
                        <input
                            className={clsx(
                                getClassName("kcButtonClass"),
                                getClassName("kcButtonPrimaryClass"),
                                getClassName("kcButtonBlockClass"),
                                getClassName("kcButtonLargeClass")
                            )}
                            type="submit"
                            value={msgStr("doSubmit")}
                            disabled={!isFormSubmittable || !didAgree}
                        />
                    </div>
                </div>
            </form>
        </Template>
    );
}