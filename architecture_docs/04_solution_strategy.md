# Solution Strategy

This describes important decision that were made to solve the problem:
* Loculus uses [LAPIS](https://github.com/GenSpectrum/LAPIS) and [SILO](https://github.com/GenSpectrum/LAPIS-SILO) to provide fast access to the sequence data.
* Loculus implements a central HTTP API to store and retrieve data.
  This API encapsulates the data storage in a Postgres database.
  All other services interact with this API.
  The API is mostly agnostic to organism-specific logic.
* A preprocessing pipeline handles the organism-specifics, such as alignment and translation.
  We provide a Nextclade-based pipeline, but maintainers can plug in their own pipeline.

