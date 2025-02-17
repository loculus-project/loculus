---
title: Configuring sequence reporting
description: How to enable and configure sequence reporting
---

By default, sequence reporting is disabled.

You can enable it in the `values.yaml` by configuring the `sequenceFlagging` section. For example:

```yaml
sequenceFlagging:
  github:
    organization: pathoplexus
    repository: curation_reports
    issueTemplate: sequence-metadata-issue.md  # (optional)
```

Sequence reporting is done through GitHub issues.
You need to have a GitHub repository where the issues will be created.
Set the `organization` and `repository` key to your organization and repository.
You can optionally configure an [issue template](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository). Issue templates are found in the `.github/ISSUE_TEMPLATES` directory in your repository.
