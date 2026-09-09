# Dependabot Duty Standard Operating Procedure

## Background

Loculus uses Dependabot to keep dependencies up to date, configured per service in [`.github/dependabot.yml`](https://github.com/loculus-project/loculus/blob/main/.github/dependabot.yml). 

Most ecosystems group minor and patch updates, so one PR often bumps several dependencies. Some dependencies are pinned via `ignore:` blocks, check the referenced issue before changing one of these.

Dependabot updates are configured to run either monthly or weekly, but don't rely on the schedule to predict when PRs appear:

- **Security updates** are triggered by new GitHub advisories, not by `dependabot.yml`. They land on any day and also cover manifests the config doesn't list (e.g. `docs/package.json`).
- Scheduled runs drift. `interval: weekly` is documented as Monday in the [dependabot reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#interval), but PRs also appear on other days.

## Daily review

When on dependabot duty, you should ideally check [open Dependabot PRs](https://github.com/loculus-project/loculus/pulls/app%2Fdependabot) once a day. For any open dependabot PRs, work through the following protocol:

### CI is green

Green CI is a good sign that nothing major broke, but still:

- Check if any of the updated dependencies are marked with comments in the PR's 'Files changed' tab, there may be instructions to ignore certain versions or to also update another dependency if a version is bumped.
- For anything that can affect front-end styling (website, docs, keycloak/keycloakify), add the `preview` label and visually compare the preview against [main's preview](https://main.loculus.org/). This is good practice as the integration tests may not catch visual regressions.
- For (larger) keycloak changes, it is a good idea to login to the keycloak admin console and confirm this still works. You can find the URL for the keycloak server under the 'Keycloak server' section of the preview's API docs. For previews, the keycloak admin username/password are admin/admin.
- Potentially skim the `Release notes`/`Changelog` in the PR description for breaking changes or changes to behaviour Loculus relies on.

If everything looks in order you can approve the PR and merge it yourself. If you performed any manual tests or checked something on a preview, add a brief description of this to the approval message.

### CI is red

Read the failing workflow's logs. If the failure looks transient (ghcr timeout, github issue, test flake, ...), rerun the failed jobs and then review as above if everything is green afterwards.

If the update itself causes tests to fail, add a fix to the PR branch. Some tips:

- Check the release notes for a migration guide.
- For failing integration tests, grab the Playwright report: failed check → *View details* → *Summary* → *Artifacts* → `playwright-report-<browser>` (kept 30 days), then `npx playwright show-report ./playwright-report-firefox.zip` (works best in Chrome).
- LLMs are quite helpful for this class of problem.

### Can't be merged

Sometimes updates are actually blocked: mutually incompatible versions, or major bumps of core dependencies (Spring Boot, Tailwind) that need a larger migration (we usually open separate PRs for these). Either way, **comment on the PR or open an issue** saying what you tried and why it's blocked, and consider adding an `ignore:` entry to [`.github/dependabot.yml`](https://github.com/loculus-project/loculus/blob/main/.github/dependabot.yml) if the PR would otherwise keep coming back. If you add an `ignore:` entry, also add a comment next to it that points to the relevant issue so the next person looking at it knows where to find context.
