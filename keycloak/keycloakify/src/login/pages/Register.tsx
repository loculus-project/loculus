import { useState } from "react";
import type { LazyOrNot } from "keycloakify/tools/LazyOrNot";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import { clsx } from "keycloakify/tools/clsx";
import type { UserProfileFormFieldsProps } from "keycloakify/login/UserProfileFormFieldsProps";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";
import orcidLogoUrl from "../assets/orcid-logo.svg";
import { TermsAcceptance } from "./TermsAcceptance";

type RegisterProps = PageProps<Extract<KcContext, { pageId: "register.ftl" }>, I18n> & {
    UserProfileFormFields: LazyOrNot<(props: UserProfileFormFieldsProps) => JSX.Element>;
    doMakeUserConfirmPassword: boolean;
};

export default function Register(props: RegisterProps) {
    const { kcContext, i18n, doUseDefaultCss, Template, classes, UserProfileFormFields, doMakeUserConfirmPassword } = props;

    const { kcClsx } = getKcClsx({
        doUseDefaultCss,
        classes
    });

    const {
        messageHeader,
        url,
        social,
        messagesPerField,
        recaptchaRequired,
        recaptchaVisible,
        recaptchaSiteKey,
        recaptchaAction
        // termsAcceptanceRequired
    } = kcContext;

    // https://github.com/loculus-project/loculus/issues/3284
    const termsAcceptanceRequired = true;

    const { msg, msgStr, advancedMsg } = i18n;

    const [isFormSubmittable, setIsFormSubmittable] = useState(false);
    const [areTermsAccepted, setAreTermsAccepted] = useState(false);

    return (
        <Template
            kcContext={kcContext}
            i18n={i18n}
            doUseDefaultCss={doUseDefaultCss}
            classes={classes}
            headerNode={messageHeader !== undefined ? advancedMsg(messageHeader) : msg("registerTitle")}
            displayMessage={messagesPerField.exists("global")}
            displayRequiredFields
        >
            <form id="kc-register-form" className={kcClsx("kcFormClass")} action={url.registrationAction} method="post">
                {social?.providers !== undefined && social.providers.length !== 0 && (
                    <>
                        <div id="kc-social-providers" className={kcClsx("kcFormSocialAccountSectionClass")}>
                            <ul className={kcClsx("kcFormSocialAccountListClass", social.providers.length > 3 && "kcFormSocialAccountListGridClass")}>
                                {social.providers.map((...[p, , providers]) => (
                                    <li key={p.alias}>
                                        <a
                                            id={`social-${p.alias}`}
                                            className={kcClsx(
                                                "kcFormSocialAccountListButtonClass",
                                                providers.length > 3 && "kcFormSocialAccountGridItem"
                                            )}
                                            type="button"
                                            href={p.loginUrl}
                                        >
                                            {p.alias === "orcid" ? (
                                                <>
                                                    <img
                                                        className={kcClsx("kcCommonLogoIdP")}
                                                        src={orcidLogoUrl}
                                                        style={{ marginRight: "-50px" }}
                                                        aria-hidden="true"
                                                        alt="ORCID logo"
                                                    />
                                                    <span className={clsx(kcClsx("kcFormSocialAccountNameClass"), "kc-social-icon-text")}>
                                                        Login with {p.displayName}
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    {p.iconClasses && (
                                                        <i className={clsx(kcClsx("kcCommonLogoIdP"), p.iconClasses)} aria-hidden="true"></i>
                                                    )}
                                                    <span
                                                        className={clsx(
                                                            kcClsx("kcFormSocialAccountNameClass"),
                                                            p.iconClasses && "kc-social-icon-text"
                                                        )}
                                                        dangerouslySetInnerHTML={{ __html: kcSanitize(p.displayName) }}
                                                    ></span>
                                                </>
                                            )}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <hr />
                        <p className="text-center">... or fill in the form below</p>
                    </>
                )}
                <UserProfileFormFields
                    kcContext={kcContext}
                    i18n={i18n}
                    kcClsx={kcClsx}
                    onIsFormSubmittableValueChange={setIsFormSubmittable}
                    doMakeUserConfirmPassword={doMakeUserConfirmPassword}
                />
                {termsAcceptanceRequired && (
                    <TermsAcceptance
                        kcContext={kcContext}
                        i18n={i18n}
                        kcClsx={kcClsx}
                        messagesPerField={messagesPerField}
                        areTermsAccepted={areTermsAccepted}
                        onAreTermsAcceptedValueChange={setAreTermsAccepted}
                    />
                )}
                {recaptchaRequired && (recaptchaVisible || recaptchaAction === undefined) && (
                    <div className="form-group">
                        <div className={kcClsx("kcInputWrapperClass")}>
                            <div className="g-recaptcha" data-size="compact" data-sitekey={recaptchaSiteKey} data-action={recaptchaAction}></div>
                        </div>
                    </div>
                )}
                <div className={kcClsx("kcFormGroupClass")}>
                    <div id="kc-form-options" className={kcClsx("kcFormOptionsClass")}>
                        <div className={kcClsx("kcFormOptionsWrapperClass")}>
                            <span>
                                <a href={url.loginUrl}>{msg("backToLogin")}</a>
                            </span>
                        </div>
                    </div>

                    {recaptchaRequired && !recaptchaVisible && recaptchaAction !== undefined ? (
                        <div id="kc-form-buttons" className={kcClsx("kcFormButtonsClass")}>
                            <button
                                className={clsx(
                                    kcClsx("kcButtonClass", "kcButtonPrimaryClass", "kcButtonBlockClass", "kcButtonLargeClass"),
                                    "g-recaptcha"
                                )}
                                data-sitekey={recaptchaSiteKey}
                                data-callback={() => {
                                    (document.getElementById("kc-register-form") as HTMLFormElement).submit();
                                }}
                                data-action={recaptchaAction}
                                type="submit"
                            >
                                {msg("doRegister")}
                            </button>
                        </div>
                    ) : (
                        <div id="kc-form-buttons" className={kcClsx("kcFormButtonsClass")}>
                            <input
                                disabled={!isFormSubmittable || (termsAcceptanceRequired && !areTermsAccepted)}
                                className={kcClsx("kcButtonClass", "kcButtonPrimaryClass", "kcButtonBlockClass", "kcButtonLargeClass")}
                                type="submit"
                                value={msgStr("doRegister")}
                            />
                        </div>
                    )}
                </div>
            </form>
        </Template>
    );
}
