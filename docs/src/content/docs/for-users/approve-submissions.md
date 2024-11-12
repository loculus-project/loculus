---
title: Approve submissions
---

Once you've uploaded sequences (this applies for new submissions as well as revisions and revocations), you will have to approve them before they are fully submitted.

## Website

After submitting sequences, you'll be taken to a page showing the progress of processing every sequence. For each sequence, it will show whether its awaiting processing, being processed, or has finished processing.

Sequences that have finished processing will show different icons to indicate whether there were any issues during the processing.

-   Green checkmark - indicates that processing was entirely successful
-   Yellow checkmark - indicates that processing encountered warnings
-   Red label - indicates that there were errors during processing

We highly recommend checking all sequences with warnings to see if they could be rectified or indicate a larger problem with the data.

You can only approve and release sequences that have yellow or green checkmarks (no warnings or errors, or only errors) - you cannot approve and release sequences with errors.

You can filter the processed sequences to only show those with warnings, errors, or which passed, to help you decide which actions to take.

If you see something you'd like to change, or want to try and resolve a warning, you can [edit the sequence](../edit-submissions).

### Actioning individual sequences

For each sequence, you have 3 options (2 if the sequence has an error), indicated to the right: release (paper plane), edit (pencil and paper), and discard (waste bin). Clicking on any of these icons for one sequence, will execute the action on that sequence only. When you release or discard a sequence, it will no longer be shown on the page.

### Actioning sequences in bulk

You can also take action on multiple sequences at once, using the buttons above the displayed sequences.

Discarding: You can choose to discard either all sequences, or those with errors. If you discard all sequences, you will need to start the submission process over.

Releasing: You can release all valid sequences (those without warnings or errors, and those with warnings), leaving only those with errors.

If you leave any sequences unreleased, you can view, edit, and release (if they have no errors) them at a later time.

## API

The following API requests all require an authentication token. Please read [Authenticating via API guide](../authenticate-via-api/) for the instructions to obtain the token an include the token in the HTTP header `Authorization: Bearer <authentication token>`.

You also need to identify the URL to the backend of the Loculus instance. Usually, it is at `https://backend.<URL of the Loculus website>`. You can find the exact link in the instance-specific Backend API Documentation which you can find by going to the "API docs" linked in the footer.

You can retrieve a list of uploaded but not released sequences by sending a GET request to the endpoint:

```
<Backend URL>/<organism>/get-sequences?groupIdsFilter=<group id>&statusesFilter=RECEIVED&statusesFilter=IN_PROCESSING&statusesFilter=PROCESSED
```

The `sequenceEntries` field of the returned object contains a list of sequences with their corresponding `status`:

-   Sequence that are in the status `RECEIVED` have not yet been processed. This should usually happen within a few minutes.
-   Sequences that are in the status `IN_PROCESSING` are currently being processed, please wait a few more moments.
- Sequences that are in the status `PROCESSED` are done processing. If they do not have errors, they can be approved. To find out more about errors, we recommend going to the review page on the website: you can find it by going to the Submission Portal and clicking on "Review".

A cURL request could be:

```
curl -X 'GET' \
  '<Backend URL>/<organism>/get-sequences?groupIdsFilter=<group id>&statusesFilter=RECEIVED&statusesFilter=IN_PROCESSING&statusesFilter=PROCESSED \
  -H 'accept: application/json' \
  -H 'Authorization: Bearer <authentication token>'
```

You can either approve selected sequences or approve all sequences that are in the status `PROCESSED` and don't have errors.
To do that, send a POST request to `<Backend URL>/<organism>/approve-processed-data` with the following request body:

```
// For a specific list of sequences:
{
  "accessionVersionsFilter": [
    { "accession": "<accession>", "version": <version> },
    …
  ],
  "groupIdsFilter": [<group id>],
  "scope": "ALL"
}

// Or to approve all entries without errors (which may include sequences with warnings):

{
  "groupIdsFilter": [<group id>],
  "scope": "ALL"
}
```

A cURL request could be:

```
curl -X 'POST' \
  '<Backend URL>/<organism>/approve-processed-data' \
  -H 'accept: application/json' \
  -H 'Authorization: Bearer <authentication token>' \
  -H 'Content-Type: application/json' \
  -d '{
  "groupIdsFilter": [<group id>],
  "scope": "ALL"
}'
```

You can also set `"scope": "WITHOUT_WARNINGS"` to only approve sequences that do not have any warnings.

Further information can be found in the API documentation of the instance.
