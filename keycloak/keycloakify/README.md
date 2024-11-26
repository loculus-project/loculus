# Loculus Keycloakify theme

This theme is primarily used for:

-   Adding ORCID support
-   Adding a little tickbox to the registration process, as well as the IDP review page (after registering with ORCID).
-   Minimal styling changes.
-   Overriding the realm name in various places.

Changes are deliberately kept minimal to make it easier to maintain the theme.

Based on upstream commit: https://github.com/keycloakify/keycloakify-starter/commit/a543bc0f73e5874648cf6d907c88aba9b4b48536

## Quick start

```bash
nvm use
corepack install
yarn install --immutable
```

If you get:

```log
error This project's package.json defines "packageManager": "yarn@4.5.1". However the current global version of Yarn is 1.22.22.
```

then uninstall the global yarn version (e.g. `homebrew install yarn`) and try `yarn install` again.

## Testing the theme locally

### Storybook

For a quick preview of the theme, you can use Storybook:

```bash
yarn storybook
```

Then visit http://localhost:6006/

### Use with actual dev Keycloak

Not so useful right now as it doesn't show the right pages yet:

```sh
npx keycloakify start-keycloak
```

(needs port 8080 to be available, so shut down your cluster if you have one running)

Then visit https://my-theme.keycloakify.dev (ensure ad blocker is disabled if you get an error).

[Documentation](https://docs.keycloakify.dev/testing-your-theme)

## How to customize the theme

[Documentation](https://docs.keycloakify.dev/customization-strategies)

## Building the theme

You need to have [Maven](https://maven.apache.org/) installed to build the theme (Maven >= 3.1.1, Java >= 7).  
The `mvn` command must be in the $PATH.

-   macOS: `brew install maven`
-   On Debian/Ubuntu: `sudo apt-get install maven`
-   On Windows: `choco install openjdk` and `choco install maven` (Or download from [here](https://maven.apache.org/download.cgi))

```bash
npm run build-keycloak-theme
```

Note that by default Keycloakify generates multiple .jar files for different versions of Keycloak.  
You can customize this behavior, see documentation [here](https://docs.keycloakify.dev/targeting-specific-keycloak-versions).
