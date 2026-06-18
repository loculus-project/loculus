# Architecture Decisions

## INSDC Interaction

Date: 2024-03

#### Status

Accepted

#### Context

We want to interact with [INSDC](https://www.insdc.org/), which consists of three members: DDBJ, ENA and NCBI.
We need to be able to download data from INSDC and upload data to INSDC.

#### Decision

We decided to:
* Use NCBI to download data, because it's [datasets cli](https://www.ncbi.nlm.nih.gov/datasets/docs/v2/download-and-install/)
  is most convenient to use.
* Use ENA to upload data, because they have a submission API that is publicly documented (the others don't have this).

## Authentication

Date: 2023-11

#### Status

Accepted

#### Context

We need to handle authorization and authentication for users. We need a system that does that.

* https://loculus.slack.com/archives/C05G172HL6L/p1697656614679099
* https://github.com/loculus-project/loculus/issues/452
* https://github.com/loculus-project/overview/discussions/15

#### Decision

We decided to use Keycloak for authentication and authorization.

## Frontend Framework

Date: 2023-06

#### Status

Accepted

#### Context

We had to decide on a frontend framework to build the Loculus website.

https://github.com/loculus-project/overview/discussions/17


#### Decision

We decided to use [Astro](https://astro.build/).

## Overall Architecture

Date: 2023-06

#### Status

Accepted

#### Context

In the early project phase, we needed to decide on the rough overall architecture of the Loculus system.
Some relevant discussions:
* https://github.com/loculus-project/overview/discussions/16
* https://github.com/loculus-project/overview/discussions/14

#### Decision

We implemented the building blocks as described in this documentation.

## Authentication: Authelia + lldap (2026)

The original Keycloak deployment was replaced with Authelia for OIDC and lldap
as the user directory. Rationale:

- Lighter footprint (Authelia and lldap together are smaller than Keycloak
  alone) and a simpler operational model for self-hosted installations.
- LDAP backend is pluggable: bundled lldap for self-hosted, or operators can
  point Authelia at an existing enterprise LDAP/AD by setting
  `auth.bundledLdap.enabled=false` and configuring `auth.ldap.*`.
- Self-registration moves into a small dedicated `registration-service` that
  writes new users into lldap via its GraphQL admin API; in BYO-LDAP mode this
  service is not deployed and registration is managed out-of-band.
- ORCID social login is dropped; can be added later in the registration
  service.
- CLI authentication moves from ROPC (unsupported in Authelia) to the OIDC
  device-code flow.
