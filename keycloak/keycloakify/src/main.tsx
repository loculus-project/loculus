import { createRoot } from "react-dom/client";
import { StrictMode, lazy, Suspense } from "react";
import { kcContext as kcLoginThemeContext } from "./login/kcContext";

const KcLoginThemeApp = lazy(() => import("./login/KcApp"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense>
      {(() => {
        if (kcLoginThemeContext !== undefined) {
          return <KcLoginThemeApp kcContext={kcLoginThemeContext} />;
        }

        throw new Error(
          "This app is a Keycloak theme" +
            "It isn't meant to be deployed outside of Keycloak"
        );
      })()}
    </Suspense>
  </StrictMode>
);
