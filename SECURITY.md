# Security Policy

The Loculus team values the work of security researchers and community members who
help us keep Loculus and its users safe.

## Reporting a vulnerability

Please report suspected vulnerabilities through
[GitHub's private vulnerability reporting form](https://github.com/loculus-project/loculus/security/advisories/new).
If the form is unavailable to you, contact a
[Loculus team member](https://loculus.org/#team) and ask to establish a private
channel for your report.

Do not include vulnerability details in a public GitHub issue, discussion, pull
request, or initial public message to a team member.

Please include as much of the following information as possible:

- The affected component and version or commit
- The type of vulnerability and its potential impact, including how it might be
  exploited
- Steps to reproduce the issue or a minimal proof of concept
- Any configuration or environment details needed to reproduce the issue
- The location of the affected source code, if known
- Relevant logs, with secrets and sensitive data removed
- Any known mitigations or suggested fixes
- A way to contact you for follow-up questions

We will acknowledge your report as soon as practical, investigate it, and keep you
informed of material progress. We ask that you give us a reasonable amount of time
to resolve the issue before publicly disclosing it. We will coordinate disclosure
with you where possible, but may disclose an unresolved issue earlier when doing so
is necessary to protect users.

## Supported versions

Loculus is currently unversioned and under active development while we work
towards a versioning system. Security fixes are applied to the `main` branch;
older revisions are not separately maintained. Operators should deploy a recent
revision and update promptly when a security fix is published.

## Scope

This policy covers security vulnerabilities in the currently maintained Loculus
source code and deployment configuration in this repository.

Loculus is self-hosted, and each deployment is operated independently. If your
report concerns the configuration, infrastructure, accounts, or data of a specific
Loculus instance, contact that instance's operator. A vulnerability in Loculus
itself should be reported to us using the private reporting form above, even if you
first observed it on a third-party instance.

## Out of scope

The following are generally out of scope:

- Vulnerabilities that have already been reported or are already known to us
- Vulnerabilities in unsupported or outdated versions that have been fixed in a
  maintained version
- Vulnerabilities in an upstream dependency that have already been reported to the
  upstream maintainer and do not introduce a Loculus-specific vulnerability
- Issues in software, services, infrastructure, or protocols that are not under
  the Loculus project's control
- Attacks that require physical access to a user's device
- Self-XSS
- Missing security hardening or best-practice recommendations without a
  demonstrable security impact
- Errors in sequence data or metadata that do not have a security impact

## Research guidelines

When investigating a potential vulnerability:

- Use your own Loculus deployment and accounts, or obtain explicit authorization
  from the relevant instance operator and account owner
- Make a good-faith effort to avoid privacy violations, unauthorized data access
  or modification, and interruption or degradation of services
- Do not perform denial-of-service testing, spam, social engineering (including
  phishing), or physical attacks
- Stop testing and report the issue if you encounter data that you are not
  authorized to access

Thank you for helping keep Loculus and its users safe.
