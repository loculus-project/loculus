// ejected using 'npx eject-keycloak-page'
import { useState } from "react";
import { clsx } from "keycloakify/tools/clsx";
import { UserProfileFormFields } from "./shared/UserProfileFormFields";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import { useGetClassName } from "keycloakify/login/lib/useGetClassName";
import type { KcContext } from "../kcContext";
import type { I18n } from "../i18n";
import orcidLogoUrl from "../assets/orcid-logo.png";

export default function RegisterUserProfile(props: PageProps<Extract<KcContext, { pageId: "register-user-profile.ftl" }>, I18n>) {
    const { kcContext, i18n, doUseDefaultCss, Template, classes } = props;
    const [didAgree, setDidAgree] = useState(false);
    const { getClassName } = useGetClassName({
        doUseDefaultCss,
        classes
    });

    const { url, social, messagesPerField, recaptchaRequired, recaptchaSiteKey } = kcContext;

    const { msg, msgStr } = i18n;

    const [isFormSubmittable, setIsFormSubmittable] = useState(false);

    return (
        <Template
            {...{ kcContext, i18n, doUseDefaultCss, classes }}
            displayMessage={messagesPerField.exists("global")}
            displayRequiredFields={true}
            headerNode={msg("registerTitle")}
        >
            <form id="kc-register-form" className={getClassName("kcFormClass")} action={url.registrationAction} method="post">
            {social.providers !== undefined && (
                    <div
                        id="kc-social-providers"
                        
                    >
                        <ul
                            className={clsx(
                                getClassName("kcFormSocialAccountListClass"),
                                social.providers.length > 4 && getClassName("kcFormSocialAccountDoubleListClass")
                            )}
                        >
                            {social.providers.map(p => (
                                <li key={p.providerId} className={getClassName("kcFormSocialAccountListLinkClass")}>
                                    <a href={p.loginUrl} id={`zocial-${p.alias}`} className={clsx("zocial", p.providerId)}>
                                        <span><img src={orcidLogoUrl} alt="ORCID logo" width={50} /> Register with {p.displayName}</span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
             
                <hr />
                <p className="text-center">..or fill in the form below</p>

                <UserProfileFormFields
                    kcContext={kcContext}
                    onIsFormSubmittableValueChange={setIsFormSubmittable}
                    i18n={i18n}
                    getClassName={getClassName}
                />
                {recaptchaRequired && (
                    <div className="form-group">
                        <div className={getClassName("kcInputWrapperClass")}>
                            <div className="g-recaptcha" data-size="compact" data-sitekey={recaptchaSiteKey} />
                        </div>
                    </div>
                )}
                <div className={getClassName("kcFormGroupClass")} style={{ "marginBottom": 30 }}>
                   

                    <div style={{
                        marginLeft: "1.5em",
                         marginRight: "1.5em"
                    }}
                    >
                        <div
                    dangerouslySetInnerHTML={{__html: kcContext.properties.REGISTRATION_TERMS_MESSAGE || ''}}
                    >
                    </div>
                    <div>
                    <label><input
                        type="checkbox"
                        id="terms"
                        name="terms"
                        onChange={(e) => {
                            setDidAgree(e.target.checked);
                        }}
                    /> I agree</label>
                    
</div>

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
                            value={msgStr("doRegister")}
                            disabled={!isFormSubmittable || !didAgree}
                        />
                    </div>
                    <div id="kc-form-options" className={getClassName("kcFormOptionsClass")}>
                        <div className={getClassName("kcFormOptionsWrapperClass")}>
                            <span>
                                <a href={url.loginUrl}>{msg("backToLogin")}</a>
                            </span>
                        </div>
                    </div>
                </div>
            </form>
        </Template>
    );
}
