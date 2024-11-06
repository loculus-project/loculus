# Quality Requirements

Following the [ISO-25010](https://iso25000.com/index.php/en/iso-25000-standards/iso-25010) standard, we define the following quality requirements for our system:

## Performance Efficiency

* Time behavior: When a submitter uploads a sequence, then the sequence should be available for querying within 10 minutes.
* Time behavior: When a user queries a sequence, then the query should return within 1 second.

## Interaction Capability

* Operability: A maintainer should be able to set up a new Loculus instance from reading the documentation.

## Security

* Integrity: Only submitters belonging to the respective group should be able to make changes on sequence data.

## Transparency

We also identified two quality requirements that don't fit into the ISO-25010 standard:

* The Loculus project is transparent. Important decisions are publicly documented.
  Users can comprehend how Loculus works and how the data is processed.
* It is comprehensible who submitted which data and when.
  This is important so that submitters can be credited appropriately for their work
  (e.g. by citing their data in a publication).
