# Loculus

Loculus is a software package to power microbial genomial databases.

## [Visit the Loculus documentation website](https://loculus-project.github.io/loculus/)

## Development

Additional documentation for development is available in each folder's README. This file contains a high-level overview of the project and shared development information that is best kept in one place.

If you would like to develop with a full local loculus instance for development you need to:

1. Deploy a local kubernetes instance: [kubernetes](/kubernetes/README.md)
2. Deploy the backend: [backend](/backend/README.md)
3. Deploy the frontend/website: [website](/website/README.md)

Note that if you are developing the backend or frontend/website in isolation a full local loculus instance is not required. See the individual READMEs for more information.

## Architecture

- Backend code is in `backend`, see [`backend/README.md`](/backend/README.md)
- Frontend code is in `website`, see [`website/README.md`](/website/README.md)
- Sequence and metadata processing pipeline is in [`preprocessing`](/preprocessing) folder, see [`preprocessing/specification.md`](/preprocessing/specification.md)
- Deployment code is in `kubernetes`, see [`kubernetes/README.md`](/kubernetes/README.md).
  Check this for local development setup instructions.
- Authorization is performed by our own keycloak instance. See config in [`keycloak-image`](kubernetes/loculus/templates/keycloak-deployment.yaml) and [`realm-config`](kubernetes/loculus/templates/keycloak-config-map.yaml). The keycloak login theme is built with a custom [keycloakify](keycloak/keycloakify) build.

The following diagram shows a rough overview of the involved software components:

![architecture](./backend/docs/plantuml/architectureOverview.svg)

## GitHub Actions

While the documentation is still a work in progress, a look at the [`.github/workflows`](/.github/workflows) folder might be helpful:

- [`backend.yml`](/.github/workflows/backend.yml) runs the backend tests and builds the backend docker image
- [`website.yml`](/.github/workflows/website.yml) runs the website tests and builds the website docker image
- [`e2e-k3d.yml`](/.github/workflows/e2e-k3d.yml) runs the end-to-end tests

## Authorization

### User management

We use keycloak for authorization. The keycloak instance is deployed in the `loculus` namespace and exposed to the outside either under `localhost:8083` or `authentication-[your-argo-cd-path]`. The keycloak instance is configured with a realm called `loculus` and a client called `backend-client`. The realm is configured to use the exposed url of keycloak as a [frontend url](https://www.keycloak.org/server/hostname).
For testing we added multiple users to the realm. The users are:

- `admin` with password `admin` (login under `your-exposed-keycloak-url/admin/master/console/`)
- `testuser:testuser` (read as username: `testuser`, password `testuser`) and `superuser:superuser` (login under `your-exposed-keycloak-url/realms/loculus/account/`)
- and more testusers, for each browser in the e2e test following the pattern: `testuser_[processId]_[browser]:testuser_[processId]_[browser]`
- These testusers will be added to the `testGroup` in the setup for e2e tests. If you change the number of browsers in the e2e test, you need to adapt `website/tests/playwrightSetup.ts` accordingly.
- To validate that a user exists we also created a technical user for the backend with username `backend` and password `backend`. The technical user is authorized to view users and groups and in principle to manage its own account.

### Group management

- Groups are entities managed by the backend, uniquely identified by a name.
- Every sequence entry is owned by the group that it was initially submitted for. Modifications (edits while awaiting approval, revisions, revocations) can only be made by members of that group.
- Each user can be a member of multiple groups.
- Users can create new groups, becoming the initial member automatically.
- Group members have the authority to add or remove other members.
- If the last user leaves a group, the group becomes 'dangling'—it exists but is no longer accessible, and a new group with the same name cannot be created.
- Admin users can manually delete a group directly on the DB but must transfer ownership of sequence entries to another group before doing so to fulfill the foreign key constraint.

For testing we added all users declared above to the group `testGroup`.

## Contributing to Loculus

Contributions are very welcome!
Please see [`CONTRIBUTING.md`](https://github.com/loculus-project/loculus/blob/main/CONTRIBUTING.md)
for more information or ping us in case you need help.
