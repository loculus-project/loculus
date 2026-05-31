---
title: Configuring sequence reporting
description: How to enable and configure sequence reporting
---

By default, sequence reporting is disabled.

:::note[Where this config now lives]
`sequenceFlagging` is part of Loculus's [database-backed instance config](../configuration-system/) — configure it through the admin dashboard (or the `kubernetes/loculus/fixtures/instance.yaml` seeded by the config loader), not in `values.yaml`. The YAML shape shown below is still correct; only its location has changed.
:::

You enable it by configuring the `sequenceFlagging` section. For example:

```yaml
sequenceFlagging:
  github:
    organization: pathoplexus
    repository: curation_reports
    issueTemplate: sequence-metadata-issue.md # (optional)
```

Sequence reporting is done through GitHub issues.
You need to have a GitHub repository where the issues will be created.
Set the `organization` and `repository` key to your organization and repository.
You can optionally configure an [issue template](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository). Issue templates are found in the `.github/ISSUE_TEMPLATES` directory in your repository.
