# File sharing

Loculus supports a "file sharing" feature, where arbitrary files can be submitted alongside regular sequence entry data.
The feature uses S3 blob storage to store the actual raw files, and a table in the backend to keep track of the files.

Just like the rest of sequence data files are not publicly accessible until they are released.

## Submission

![submission](./plantuml/sequenceFileSharingSubmission.svg)

## Preprocessing

![preprocessing](./plantuml/sequenceFileSharingPrepro.svg)

## Releasing

To release a file (i.e. make it public), the file only needs to be tagged with `public=true`.
The bucket is configured to allow public access for files which are tagged like this.

## The files table

The database has a table to keep track of the files:

```
CREATE TABLE public.files (
    id uuid NOT NULL,
    upload_requested_at timestamp without time zone NOT NULL,
    uploader text NOT NULL,
    group_id integer NOT NULL,
    released_at timestamp without time zone
);
```

Entries in this table are created by the backend, then the `request-uploads` endpoint is called.
From that request, it is recorded who made the request, for which group and when.
Note that the file does not yet exist in S3, the user still needs to upload it.

On release, the release time is also marked in the database.

This table can also be used to find "orphaned" files, i.e. files that have been requested and uploaded,
but haven't been referenced in any sequence submission.
