# Building Block View

In the following diagrams, the arrows point from the actor to the system component that is used by the actor.
Data flow may be in the opposite direction
(e.g. in the case of a download: the actor requests a download from the website, the website sends the data to the
actor).

## Overview

This diagram provides a high level overview of the components of Loculus
and how they interact with each other and external participants.

![Building Block View](plantuml/05_level_1.svg)

* Users can either
    * use the website to browse the data and download sequences
    * or they can use LAPIS directly to query the data (e.g. for automated analysis).
* Submitters can 
  * log in via Keycloak 
  * submit new sequence data via the website
  * or they can use the API directly to automate their submission process.
* The backend infrastructure stores and processed the data.
* LAPIS / SILO provides the query engine for the sequence data that is stored in the backend infrastructure.
* The backend infrastructure also fetches sequence data from / uploads sequence data to INSDC services.
* The website and the backend infrastructure use Keycloak to verify the identity of users.

## LAPIS / SILO

This diagram shows how Loculus utilizes 
[LAPIS](https://github.com/GenSpectrum/LAPIS) and
[SILO](https://github.com/GenSpectrum/LAPIS-SILO).

![LAPIS / SILO](plantuml/05_level_2_lapis.svg)

* LAPIS provides an HTTP API to query the sequence data.
  * LAPIS is used by the website, but it can also be used by users directly. 
* The SILO API is a query engine that stores the data in memory to provide fast access.
  LAPIS accesses it via HTTP. 
* The SILO preprocessing fetches data from the Loculus backend in a regular interval,
  processes it into a format that the SILO API can load and stores the result in a shared volume (on disc).
  * The SILO API will pick up the processed data and load it into memory.

## Loculus Backend Infrastructure

This diagram shows the backend infrastructure of Loculus.

![Backend Infrastructure](plantuml/05_level_2_backend.svg)

The "Loculus Backend" is the central HTTP API.
It encapsulates the data storage.
All data is stored in a Postgres database.
Several other components interact with the backend:
* The website
  * sends data to the backend (e.g. new sequence data, new created groups)
  * requests data from the backend (e.g. some parts of sequence data, groups)
* Submitters can use the API directly to submit new sequence data.
* The preprocessing pipeline fetches unprocessed data, processes it and resubmits it to the backend.
* The Ingest service fetches data from NCBI and submits it to the backend.
  * Ingest must be specifically enabled for a specific organism.
* The ENA deposition service checks whether new data has been uploaded to Loculus and submits it to ENA.
  * ENA deposition must be specifically enabled for a specific organism.
* The SILO preprocessing fetches all sequence data from the backend and loads it into SILO.
