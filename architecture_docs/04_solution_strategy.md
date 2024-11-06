# Solution Strategy

This describes important decision that were made to solve the problem:
* Loculus implements a central HTTP API (the "Loculus backend") to store and retrieve data.
  This API encapsulates the data storage in a Postgres database.
  All other services interact with this API.
  The API is mostly agnostic to organism-specific logic.
* A preprocessing pipeline handles the organism-specifics, such as alignment and translation.
  We provide a Nextclade-based pipeline, but maintainers can plug in their own pipeline.
* Loculus uses [LAPIS](https://github.com/GenSpectrum/LAPIS) and [SILO](https://github.com/GenSpectrum/LAPIS-SILO) to provide fast access to the sequence data.
  The backend and the preprocessing pipeline enrich and validate the uploaded data such that it can safely be loaded into LAPIS/SILO.
* The website provides a user-friendly interface to interact with the data.
  But we designed Loculus such that it can also be used through the API directly.
