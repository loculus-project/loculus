---
title: Submit sequences
---

You can only upload sequences if you already have an account and [are part of a submitting group](../create-manage-groups/).

You can submit sequences either by uploading files or entering sequence metadata on the website directly.
The form submits a single individual sequence entry, to submit multiple sequence entries with one upload you can use the bulk submission tool, uploading a metadata table and a multi-sequence FASTA.

## Submit a single sequence through the form

1. Log into your account, and then click 'Submit' in the top-right corner of the website.
2. Select the organism that you'd like to submit sequences for.
3. Click the 'Submit' button.
4. Click on 'Submit single sequence'.
5. Enter the metadata information about your sequence, as well as the unaligned nucleotide sequence(s).
6. If Terms of Use are enabled for your Loculus instance: Select the Terms of Use that you would like for your data.
7. Select 'Submit sequences' at the bottom of the page.

## Submit sequences via file upload

Before you begin this process, you should ensure your data is in the correct format. Each sequence should have a unique ID that can be used to associate it with its corresponding metadata entry.

Loculus expects:

- Sequence data in [`fasta` format](../../reference/fasta-format) with a unique ID per sequence.
- Metadata for each sequence. If you upload through the API, only `tsv` is supported. If you upload through the Website, you can also use Excel files (`xlsx` format). If you need help formatting metadata, there is a metadata template for each organism on the submission page in each of the supported formats. You can also map columns in your file to the expected upload column names by clicking the 'Add column mapping' button.

![Metadata template.](../../../assets/MetadataTemplate.png)

### Multi-segmented Pathogens

Loculus expects multi-segmented pathogens to have one unique ID per **isolate** (pathogen sample containing all segments). However, `fasta` files should still have a separate entry/record per segment. Therefore, each record's FASTA id should include the unique ID of the isolate and the segment name, for example: `ID + '_' + segmentName`. The metadata is uploaded per isolate, i.e. there will be only one row for each `ID` and segmented metadata parameters need to be uploaded individually, i.e. under `length_{segmentName}` etc.

### Website

Uploading sequences via the website is an easy way to submit sequences without having to worry about any code.

1. Log into your account, and then click 'Submit' in the top-right corner of the website.
2. Select the organism that you'd like to submit sequences for.
3. Click the 'Submit' button.
4. Drag-and-drop a `fasta` file with the sequences and a metadata file with the associated metadata into the box on the website, or click the 'Upload a file' link within the boxes to open a file-selection box.
5. If Terms of Use are enabled for your Loculus instance: Select the Terms of Use that you would like for your data.
6. Select 'Submit sequences' at the bottom of the page.

The data will now be processed, and you will have to approve your submission before it is finalized. You can see how to do this [here](../approve-submissions/).

### API

It is possible to upload sequences through an HTTP API. We also plan to release a command-line interface soon.

To upload sequences through the HTTP API you will need to:

1. To identify the URL to the backend of the Loculus instance, see [Where are the APIs?](../../introduction/api-overview/#where-are-the-apis).
2. Retrieve an authentication JSON web token: see the [Authenticating via API guide](../authenticate-via-api/).
3. Identify the Group ID of your group: you can find it on the page of your group.
4. Send a POST request:
   - The API path to use is: `<Backend URL>/<organism>/submit`
   - Add your group ID to the query parameters: `?groupId=<group id>`
   - If Data use Terms are configured for your Loculus instance, add `&dataUseTermsType=OPEN` for _open_ data use terms or `&dataUseTermsType=RESTRICTED&restrictedUntil=YYYY-MM-DD` (where `YYYY-MM-DD` refers to a date like 2025-01-31) for _restricted_ data use terms - with a date until when this restriction will be in place. If your Loculus instance doesn't use Data use Terms, you can leave out these settings.
   - The header should contain
     - `Authorization: Bearer <authentication-token>`
     - `Content-Type: multipart/form-data`
   - The request body should contain the FASTA and metadata TSV files with the keys `sequenceFile` and `metadataFile`

Below you can see an example of submitting to the API with cURL (with open data use terms):

```
curl -X 'POST' \
  '<Backend URL>/<organism>/submit?groupId=<group id>&dataUseTermsType=OPEN' \
  -H 'accept: application/json' \
  -H 'Authorization: Bearer <authentication token>' \
  -H 'Content-Type: multipart/form-data' \
  -F 'metadataFile=@<metadata file name>' \
  -F 'sequenceFile=@<fasta file name>'
```

Further information can be found in the API documentation of the instance.

As with the website, data will now be processed, and you will have to approve your submission before it is finalized. You can see how to do this [here](../approve-submissions/).

### Compressing files

For both sequence and metadata files, compression is supported. The supported formats are: `zip`, `gz` (gzip), `zst` (ZStandard) and `xz` (LZMA). (Note that Excel file uploads with `xz` compression are currently not supported.)
