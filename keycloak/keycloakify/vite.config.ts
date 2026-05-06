import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { keycloakify } from "keycloakify/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        keycloakify({
            accountThemeImplementation: "none",
            themeName: "loculus",
            keycloakVersionTargets: {
                // Keep up to date with keycloakify upgrades
                // Requires changes for major versions of Keycloak
                // See https://docs.keycloakify.dev/targeting-specific-keycloak-versions
                "22-to-25": "loculus-theme.jar",
                "all-other-versions": false
            },
            environmentVariables: [
                { name: "PROJECT_NAME", default: "Loculus" },
                { name: "REGISTRATION_TERMS_MESSAGE", default: "" }
            ]
        })
    ]
});
