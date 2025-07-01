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

### Uploading the files

To upload files, call the `/files/request-upload` endpoint.
You need to provide a group ID, which is the group that will then own the files.
Also give a number of how many files you want to upload.

curl example:

```bash
curl -X POST \
  'https://backend-fs-user-docs.loculus.org/files/request-upload?groupId=2&numberFiles=3' \
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
  "https://s3-fs-user-docs.loculus.org/loculus-preview-private/files/0699d6..."
```

### Attach file IDs to submission

Now, you can follow the regular steps for [sequence submission](./submit-sequences), calling the `/<organism>/submit` endpoint.
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
- The `fileName` can be chosen freely, but depending on configurtion it might become an identifier for the file later on.
