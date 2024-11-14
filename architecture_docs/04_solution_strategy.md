# Solution Strategy

This describes important decisions that were made to solve the problem:
* Loculus implements a central HTTP API (the "**Loculus backend**") to store and retrieve data.
  This API encapsulates the **data storage** in a Postgres database.
  All other services interact with this API.
  The API is mostly agnostic to organism-specific logic.
  It is also not meant to provide special query capabilities for genomic data, it just provides the plain data. 
* A **preprocessing pipeline** handles the **organism-specifics**, such as alignment and translation.
  We provide a Nextclade-based pipeline, but maintainers can plug in their own pipeline.
* Loculus uses [**LAPIS**](https://github.com/GenSpectrum/LAPIS) and [**SILO**](https://github.com/GenSpectrum/LAPIS-SILO) to **query the sequence data efficiently**.
  LAPIS is a separate HTTP API.
  The backend and the preprocessing pipeline enrich and validate the uploaded data such that it can safely be loaded into LAPIS/SILO.
  Whenever users access sequence data, the primary data source should be LAPIS.
* The **website** provides a **user-friendly interface** to interact with the data.
  But we designed Loculus such that it can also be used through the API directly.
