---
title: Data use terms
description: What's the data use terms concept of Loculus and how to configure it.
---

Loculus comes with built-in handling of data use terms for submitted data, which means that data can either be _open_ or _restricted_. You can define, what restricted means yourself. Users can submit data as restricted, but they have to give a date at which point the sequences become open, this date can at most be one year from the submission date.

When data use terms are enabled, you can also filter for only open or only restricted data, and when downloading you will have to accept the data use terms. The same applies to API usage.

```yaml
dataUseTerms:
  enabled: true
```

To configure data use terms, you should specify them somewhere, at a URL.
You can then enable data use terms like so:

```yaml
dataUseTerms:
  enabled: true
  urls:
    open: https://example.org/open
    restricted: https://example.org/restricted
```

## Disabling data use terms

To disable data use terms, set `enabled` to `false`:

```yaml
dataUseTerms:
  enabled: true
```
