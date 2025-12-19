# Docker Image Mirroring

This directory contains configuration and workflows for mirroring Docker Hub images to GitHub Container Registry (GHCR) to avoid Docker Hub rate limits.

## Overview

The mirroring system consists of:

1. **Configuration File**: `.github/docker-image-mirror-config.yaml` - Lists all Docker Hub images to mirror
2. **Mirror Workflow**: `.github/workflows/mirror-docker-images.yml` - Automated workflow that mirrors images

## How It Works

1. The workflow runs daily at 3 AM UTC (can also be triggered manually)
2. It reads the configuration file to get the list of images to mirror
3. For each image, it:
   - Checks if the image already exists in GHCR (skips if it does, unless forced)
   - Pulls the image from Docker Hub
   - Tags it for GHCR under `ghcr.io/loculus-project/`
   - Pushes it to GHCR

## Adding New Images to Mirror

To add a new Docker Hub image to the mirror:

1. Edit `.github/docker-image-mirror-config.yaml`
2. Add a new entry under `images:`:
   ```yaml
   - source: dockerhub-user/image:tag
     destination: ghcr.io/loculus-project/image:tag
     description: "Brief description of what this image is used for"
   ```
3. Commit and push the changes
4. The workflow will automatically mirror the new image on its next run
5. You can also manually trigger the workflow to mirror immediately

## Using Mirrored Images

Once an image is mirrored, update your workflows or Dockerfiles to use the GHCR version:

**Before:**
```yaml
uses: docker://flyway/flyway:10-alpine
```

**After:**
```yaml
uses: docker://ghcr.io/loculus-project/flyway:10-alpine
```

**Before (Dockerfile):**
```dockerfile
FROM flyway/flyway:11.10.0-alpine-mongo
```

**After (Dockerfile):**
```dockerfile
FROM ghcr.io/loculus-project/flyway:11.10.0-alpine-mongo
```

## Manual Workflow Trigger

You can manually trigger the mirror workflow from the GitHub Actions UI:

1. Go to Actions → "Mirror Docker Images to GHCR"
2. Click "Run workflow"
3. Optionally check "Force mirror all images" to re-mirror even if they already exist

## Benefits

- **Avoid Rate Limits**: GHCR has much more generous rate limits than Docker Hub
- **Faster CI**: Images are pulled from GHCR which is better integrated with GitHub Actions
- **Reliability**: Less likely to experience service disruptions
- **Centralized Control**: All image versions are managed in one configuration file

## Current Mirrored Images

See `.github/docker-image-mirror-config.yaml` for the complete list of mirrored images.
