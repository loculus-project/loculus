# Risks and Technical Debt

## Configuration Processing

We use a `values.yaml` file as a main input source for the Helm chart for the configuration of a Loculus instance.

We leveraged the powerful templating capabilities of Helm to generate the configuration files for the individual artifacts.
This works well, because we can distribute the mostly redundant configuration values efficiently.

However, this became quite complex and hard to maintain over time.
It is untested and hard to debug, if something goes wrong.
It is also (as of now) mostly undocumented.

Some parts of the configuration are redundant and could be simplified.
Also, the Helm chart contains a lot of default values 
that are not suitable for general Loculus instances and will result in unexpected behavior if not overwritten.

## ENA Deposition

The ENA deposition service was written to sync sequences that have been uploaded to Loculus back to INSDC (ENA in this case).
When there is an ingest service running for the same organism, 
then there is the risk of uploading the sequences to ENA that have been previously downloaded from NCBI.
There is also a risk of uploading the same sequence twice (e.g. once the original version, once a revised version).

To prevent this, the ENA deposition and the ingest service were given direct database access:
1. The ENA deposition service accesses a separate schema in the same database as the backend,
  where it duplicates the data from the backend to keep track of which sequences have already been uploaded. It also stores the submission state to prevent uploading sequences twice and keep track of the submission process.
2.  The ingest service accesses the same schema as the deposition to check which ingested sequences have been uploaded by Loculus.

A solution to the first problem would be to adapt the backend such that it can track which sequences have been uploaded to ENA (however, we decided against this as there was a strong desire to keep the ena deposition separate and not part of the backend).
A solution to the second problem could be merging the ENA deposition and the ingest service into a single service.
Both services should not need access to the main, public DB schema, however ENA deposition must store state so it does require access to some sort of database. If we continue to use the same database and just have the ENA deposition use a different schema we should create different database users with different access levels.
