---
title: Submitting extra files alongside your sequences
---

If the administrator has enabled the file sharing feature for an organism, you can upload files for preconfigured categories of files.

## Website

On the website submission form, there is an input field to upload files into.

![The extra files component](../../../assets/ExtraFilesComponent.png)

If files are uploaded successfully, there will be a green checkmark:

![The extra files component](../../../assets/ExtraFilesUploaded.png)

For bulk submission, you need to upload a folder with one subfolder per submission ID.

## API

To submit files via the API, it's a two step process.

1. Upload the files, and receive file IDs for them.
2. Attach the file IDs during submission.

:::note
You can submit the same file ID (and thus the same file) with multiple submission IDs or sequences.
You do not need to upload it multiple times.
:::

### Uploading the files

#### Simple upload

The simple (single-part) way to upload files is to call the `/files/request-upload` endpoint.
You need to provide a group ID, which is the group that will then own the files and give a number of how many files
you want to upload.

curl example:

```bash
curl -X POST \
  '<Backend URL>/files/request-upload?groupId=2&numberFiles=3' \
  -H 'accept: application/json' \
  -H 'Authorization: Bearer eyJhbGciOiJSUzI1...' \
```

The endpoint returns an array of file IDs and pre-signed URLs to use to upload the file to:

```json
[
  {
    "fileId": "8D8AC610-566D-4EF0-9C22-186B2A5ED793",
    "url": "https://dummyendpoint.com/dummybucket/files/2ea137d0-8773-4e0a-a9aa-5591de12ff23?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=dummyaccesskey%2F20250330%2Fdummyregion%2Fs3%2Faws4_request&X-Amz-Date=20250330T184050Z&X-Amz-Expires=1800&X-Amz-SignedHeaders=host&X-Amz-Signature=9717e8d8c8242d0d266f816c665d78b1d842de5286fb59e37329f090e9bb0b9e"
  },
  ...
]
```

Use the pre-signed URL to upload your file:

```bash
curl -X PUT \
  -T hello-world.txt \
  "<presigned URL>"
```

#### Multipart upload

For large files (typically over 100 MB), you can use multipart upload which allows uploading a file in smaller chunks.
This provides better reliability and performance for large file transfers.

The multipart upload process involves three steps:

1. Request multipart upload URLs
2. Upload the file parts
3. Complete the multipart upload

##### Step 1: Request multipart upload URLs

Call the `/files/request-multipart-upload` endpoint, specifying the number of files and the number of parts per file. curl example:

```bash
curl -X POST \
  '<Backend URL>/files/request-multipart-upload?groupId=2&numberFiles=1&numberParts=3' \
  -H 'accept: application/json' \
  -H 'Authorization: Bearer eyJhbGciOiJSUzI1...'
```

The endpoint returns an array with file IDs and presigned URLs for each part:

```json
[
  {
    "fileId": "8D8AC610-566D-4EF0-9C22-186B2A5ED793",
    "urls": [
      "https://dummyendpoint.com/dummybucket/files/8D8AC610-566D-4EF0-9C22-186B2A5ED793?partNumber=1&X-Amz-Algorithm=...",
      "https://dummyendpoint.com/dummybucket/files/8D8AC610-566D-4EF0-9C22-186B2A5ED793?partNumber=2&X-Amz-Algorithm=...",
      "https://dummyendpoint.com/dummybucket/files/8D8AC610-566D-4EF0-9C22-186B2A5ED793?partNumber=3&X-Amz-Algorithm=..."
    ]
  }
]
```

##### Step 2: Upload the file parts

Split your file into parts and upload each part to its corresponding presigned URL. Each part should be uploaded in order using the URLs provided.

```bash
# Upload part 1
curl -X PUT \
  -T large-file-part1 \
  "<presigned URL for part 1>"
```

**Important**: Save the `ETag` header value from each response. You'll need these for the next step.

The response headers will include something like:

```
ETag: "d41d8cd98f00b204e9800998ecf8427e"
```

Repeat this process for each part. Note that:

- All parts except the last one should be at least 5 MB
- You don't need to use all the provided URLs if your file requires fewer parts

##### Step 3: Complete the multipart upload

After uploading all parts, call the `/files/complete-multipart-upload` endpoint with the file ID and the ETags from each part:

```bash
curl -X POST \
  '<Backend URL>/files/complete-multipart-upload' \
  -H 'accept: application/json' \
  -H 'Authorization: Bearer eyJhbGciOiJSUzI1...' \
  -H 'Content-Type: application/json' \
  -d '[
    {
      "fileId": "8D8AC610-566D-4EF0-9C22-186B2A5ED793",
      "etags": [
        "d41d8cd98f00b204e9800998ecf8427e",
        "098f6bcd4621d373cade4e832627b4f6",
        "5d41402abc4b2a76b9719d911017c592"
      ]
    }
  ]'
```

The ETags must be provided in the order of the parts. Once the multipart upload is completed successfully,
you can proceed to attach the file ID to your submission as described in the next section.

### Attach file IDs to submission

Now, you can follow the regular steps for [sequence submission](../submit-sequences/), calling the `/<organism>/submit` endpoint.
But you add another parameter to the curl call:

```bash
  -F 'fileMapping=<mapping JSON>'
```

And the `mapping JSON` has this structure:

```json
{submissionID: {<fileCategory>: [{fileId: <fileId>, name: <fileName>}]}}
```

- The `submissionID` links the file mapping to the sequence.
- The `fileCategory` needs to be a predefined category which is organism specific.
- The `fileId` is the ID received in the previous step, which identifies the actual file.
- The `fileName` can be chosen freely, but depending on configuration it might become an identifier for the file later on.

## Filename restrictions

The filenames may contain any UTF-8 characters except:

- Forbidden characters: `< > : " / \ | ? *`
- ASCII control characters (character codes 0-31)

Filenames may not be empty or contain more than 255 characters.
