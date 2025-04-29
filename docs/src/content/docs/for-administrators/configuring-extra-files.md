---
title: Configuring extra file submission
---

Loculus supports the handling of arbitrary files.
You can configure Loculus to support the submission of extra files for sequences, as well as providing extra files along with the sequence data and metadata for download. A typical usecase would be for raw reads. The files are stored in S3.

## Configuring an S3 bucket

You should operate an S3 bucket, and have the credentials at hand.

Enable S3 and configure the location of the bucket:

```yaml
s3:
  enabled: true
  bucket:
    region: us-east-1
    bucket: loculus-preview-private
```

Configure the credentials:

```yaml
secrets:
  s3-bucket:
    type: raw
    data:
      accessKey: 'yourAccessKeyHere'
      secretKey: 'yourSecretKeyHere'
```

The backend makes files in the bucket public, by tagging them with `public=true`.
For this to work, you need to configure a bucket policy like this:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": ["arn:aws:s3:::$bucket/*"],
      "Condition": {
        "StringEquals": {
          "s3:ExistingObjectTag/public": "true"
        }
      }
    }
  ]
}
```

## Configuring file submission

Users can submit files along with sequence metadata and sequences (or also instead of sequences).
For this, you need to enable the `files` submission type, and configure at least one file category that users can submit:

```yaml
my-organism:
  schema:
    submissionDataTypes:
      files:
        enabled: true # enable the feature
        categories:
          - name: raw_reads # configure a submission category
```

The example above configures the `raw_reads` file category.

If a user submits these files, they will be passed along to the processing pipeline as well, and the pipeline can read them, pass them through as ouput files, or generate additional fields or process them in any other way.

## Configuring output files

By default, files are not shown in the sequence detail view as well.
You need to configure output files as well, and the pipeline needs to set them.

To configure:

```yaml
my-organism:
  schema:
    files:
      - name: raw_reads
```

:::note
The name (`raw_reads` in the example above) needs to not be a name that is also used by a metadata field!
:::
