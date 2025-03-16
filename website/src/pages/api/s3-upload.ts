import type { APIRoute } from 'astro';
import { 
  S3Client, 
  CreateMultipartUploadCommand, 
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  UploadPartCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Using the same hardcoded credentials as in FolderUploadComponent
const S3_ACCESS_KEY = 'DO801T47U9TD97HYQCY6';
const S3_SECRET_KEY = 'lMxSZ+ARjfmIlpAO6QxgWIPoN8fDHXrm1MQFnBuuR8I';
const S3_ENDPOINT = 'https://temporary-test-bucket.nyc3.digitaloceanspaces.com';
const S3_BUCKET = 'temporary-test-bucket';
const S3_REGION = 'nyc3';

// Create an S3 client
const s3Client = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY
  },
  forcePathStyle: true
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const requestData = await request.json();
    const { action, key, contentType, uploadId, partNumber, parts } = requestData;

    if (!key || !action) {
      return new Response(
        JSON.stringify({ error: 'Key and action are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Handle different stages of multipart upload process
    switch (action) {
      case 'initiate': {
        // Initiate a multipart upload
        const command = new CreateMultipartUploadCommand({
          Bucket: S3_BUCKET,
          Key: key,
          ContentType: contentType || 'application/octet-stream'
        });

        const { UploadId } = await s3Client.send(command);
        
        return new Response(
          JSON.stringify({ 
            uploadId: UploadId,
            key,
            bucket: S3_BUCKET
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      case 'getPresignedUrl': {
        // Generate a presigned URL for a specific part
        if (!uploadId || !partNumber) {
          return new Response(
            JSON.stringify({ error: 'uploadId and partNumber are required for presigned URLs' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const command = new UploadPartCommand({
          Bucket: S3_BUCKET,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber
        });

        const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        
        return new Response(
          JSON.stringify({ 
            presignedUrl,
            partNumber,
            uploadId,
            key,
            bucket: S3_BUCKET 
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      case 'complete': {
        // Complete the multipart upload
        if (!uploadId || !parts || !Array.isArray(parts)) {
          return new Response(
            JSON.stringify({ error: 'uploadId and parts array are required to complete upload' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const command = new CompleteMultipartUploadCommand({
          Bucket: S3_BUCKET,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts }
        });

        const result = await s3Client.send(command);
        
        return new Response(
          JSON.stringify({ 
            location: result.Location,
            bucket: S3_BUCKET,
            key,
            etag: result.ETag
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      case 'abort': {
        // Abort a multipart upload
        if (!uploadId) {
          return new Response(
            JSON.stringify({ error: 'uploadId is required to abort upload' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const command = new AbortMultipartUploadCommand({
          Bucket: S3_BUCKET,
          Key: key,
          UploadId: uploadId
        });

        await s3Client.send(command);
        
        return new Response(
          JSON.stringify({ message: 'Upload aborted successfully' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Error handling S3 upload request:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};