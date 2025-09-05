---
title: Configuring extra file submission
---

Loculus supports the handling of arbitrary files associated with sequence entries.
You can configure Loculus to support the submission of extra files for sequences, as well as providing extra files along with the sequence data and metadata for download. A typical usecase would be for raw reads. The files are stored in [S3](../../reference/glossary#s3-simple-storage-service).

To enable this feature you need to configure an S3 bucket for Loculus to use, and then configure the file categories per organism.

## Conceptual overview

Extra files submitted alongside sequence and metadata are treated differently. Loculus uses S3 - a generic object storage service - to store these files. Files are uploaded directly to S3 using presigned URLs.

Unlike files that contain sequence data, the file sharing files are not inherently coupled to any particular sequence.
Files are uploaded first, and then associated to a sequence entry; at the time of uploading, only an owning group needs to be specified. Because of this, the same file can also be attached to multiple sequence entries as well.

The files will not be publicly accessible, until an associated sequence entry is released.

When configuring this feature for an organism, you can configure file categories for which users can submit files, as well as file "output" categories, which will then be visible alongside other sequence data and metadata in the sequence detail view. You can also configure only submit files (which can then be used by the preprocessing pipeline in some way) or only "output" files, which the preprocessing pipeline can generate on its own. The preprocessing pipeline gets access to submitted files before they are released, and the pipeline can also upload its own new files.

## Loculus configuration


### Configuring an S3 bucket to use

You need admin access to an S3 bucket, and have the [credentials](../../reference/glossary#s3-credentials) at hand.

Enable S3 and configure the location of the bucket:

```yaml
s3:
  enabled: true
  bucket:
    region: us-east-1
    endpoint: https://my-s3.net
    bucket: loculus-data
```

:::note
Have a look at the [Helm Chart S3 reference](../../reference/helm-chart-config/#s3-deployments) for more information on these configuration settings.
:::

Configure the credentials using [sealed secrets](https://github.com/bitnami-labs/sealed-secrets):

```yaml
secrets:
  s3-bucket:
    type: sealedsecret
    clusterWide: 'true'
    encryptedData:
      accessKey: AgCm73j1g21Dn....
      secretKey: AgAS8a/ldl....
```

:::note
You can also use the `raw` secret type, but be aware that keeping credentials in plain text in your configuration file can be a security hazard.
:::

### Configuring file submission

Users can submit files along with sequence metadata and sequences (or also instead of sequences).
For this, you need to enable the `files` submission type, and configure at least one file category that users can submit:

```yaml
my-organism:
  schema:
    submissionDataTypes:
      files:
        enabled: true # enable the feature
        categories:
          - name: rawReads # configure a submission category
```

The example above configures the `rawReads` file category.

If a user submits these files, they will be passed along to the processing pipeline as well, and the pipeline can read them, pass them through as output files, or generate additional fields or process them in any other way.

### Configuring output files

By default, files are not shown in the sequence detail view as well.
You need to configure output files as well, and the pipeline needs to set them.

To configure:

```yaml
my-organism:
  schema:
    files:
      - name: rawReads
```

:::note
The name (`rawReads` in the example above) must not be a name that is also used by a metadata field!
:::

## S3 Configuration

To make sure that Loculus can access the given bucket, and to allow you to read files directly from S3, you need to ensure some configuration settings in your S3 bucket.
The default of your particular S3 provider might mean that you do not have to do some of these steps or that something is configured in a different way.

[`s3cmd`](https://github.com/s3tools/s3cmd) is a good tool to configure S3.
Once installed, you can configure it to access your bucket with `s3cmd --configure`.

### Set CORS bucket policy

Depending on your S3 provider, you might have to configure a CORS policy for your bucket which allows access from the Loculus website to your bucket. Without it, your browser will raise an error when trying to upload files to S3.

You can set a permissive CORS policy on your bucket with `s3cmd setcors cors.xml s3://<bucketname>`, where `<bucketname>` is the name of your bucket, and `cors.xml` is a file with this content:

```xml
<CORSConfiguration>
  <CORSRule>
    <AllowedHeaders>*</AllowedHeaders>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>DELETE</AllowedMethod>
    <AllowedOrigin>*</AllowedOrigin>
  </CORSRule>
</CORSConfiguration>
```

Also consult the documentation for you S3 provider to find out about CORS policy configuration. For example: [AWS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html) and [Hetzner](https://docs.hetzner.com/storage/object-storage/howto-protect-objects/cors/).

### Set S3 policy

:::note
This step is only required if you wish to be able to have the files be set to public on your S3 instance, accessible without the need to request pre-signed URLs from the backend.

There is currently a bug that may lead to a file not being set to public in rare cases (due to race conditioning, see [GitHub issue](https://github.com/loculus-project/loculus/issues/4806)).
:::

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

You can do this with `s3cmd`. Save the policy above in a file, `policy.json` and then call `s3cmd setpolicy policy.json s3://<bucket-name>` (`replace <bucket-name> with your bucket name`). Also consult the documentation of your particular S3 provider on how to configure bucket policies.
