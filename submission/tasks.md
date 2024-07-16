# Tasks

## Create bioprojects per group/organism

Unique (namespaced) id per group (per organism: maybe not?) per loculus instance

- com.pathoplexus.ebola-zaire/1/private
- com.pathoplexus.ebola-zaire/1/public

Embedded in the project metadata (on ENA) to allow parsing out from ENA

When you start up, you query ENA for all the projects and build a dict that maps `id -> project_accession`

### Testing

Can test with dev instance

Per group:

To create group:

- Make id
- Create group
- Verify that group exists

Usually, can get the accession back from ENA

## Look up existing projects from ENA

Go from ENA -> existing groups

## Feeding back ENA data to the backend (POSTing)

Have a table in backend that maps `id -> project_accession`, potentially just add to groups table if there's one project per group across all organisms (rather than per group)

### Sequences

Create a sample for the metadata

Config: mapping from loculus column names to the structured sample identifier

In the sample, mention crossreference to Loculus to avoid duplicates

### Testing

Can test with dev server

## How to store state in the backend

### Assemblies

Programmatic submission via CLI

Querying for pending/accepted/rejected assemblies and their final accession

### Moving from private to public

Edit the sample/accession to belong to a different project to move from private to public

### Testing

Can test for samples how this works on the dev instance

For assembly, need to operate on live instance (probably), ask ENA to delete

Write high-level functions that abstract the complexity away
