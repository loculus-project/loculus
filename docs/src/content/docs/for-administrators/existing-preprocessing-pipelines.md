---
title: Existing preprocessing pipelines
---

[Preprocessing pipelines](../../introduction/glossary/#preprocessing-pipeline) hold most of the organism- and domain-specific logic within a Loculus instance. They take the submitted input data and, as a minimum, validates them to ensure that the submitted data follow the defined format. Additionally, they can clean the data and enrich them by adding annotations and sequence alignments.

At the moment, we (the Loculus team) have developed a pipeline which uses [Nextclade](../../introduction/glossary/#nextclade); we describe it in more detail below.

Using an existing pipeline is the fastest way to getting started with Loculus but it is also easy to develop new pipelines. The [preprocessing pipeline specification](https://github.com/loculus-project/loculus/blob/main/preprocessing/specification.md) describe the interface between a pipeline and the [Loculus backend server](../../introduction/glossary/#backend-server) and you can take a look at the code of the ["dummy pipeline"](https://github.com/loculus-project/loculus/tree/main/preprocessing/dummy) and the [Nextclade-based pipeline](https://github.com/loculus-project/loculus/tree/main/preprocessing/nextclade) (both examples are written in Python but this is absolutely not a requirement, it is possible to implement preprocessing pipelines in any programming language).

If you developed a pipeline and would like it to be added to this list, please contact us!

## Nextclade-based pipeline

_Maintained by the Loculus team_

TODO: add short description and feature list

TODO: point out limitations / which schema models it does not support?

The code is available on [GitHub](https://github.com/loculus-project/loculus/tree/main/preprocessing/nextclade) under the [AGLP-3.0 license](https://github.com/loculus-project/loculus/blob/main/LICENSE).
