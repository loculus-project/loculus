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
            environmentVariables: [
                { name: "PROJECT_NAME", default: "Loculus" },
                { name: "REGISTRATION_TERMS_MESSAGE", default: "" }
            ]
        })
    ]
});
