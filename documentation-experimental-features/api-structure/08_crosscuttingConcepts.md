# 8. Crosscutting Concepts

## Version groups

`current` is a backend-level concept that injects `versionStatus=LATEST_VERSION`. `allVersions` leaves version history visible to LAPIS.

## Streaming

The backend forwards LAPIS responses as `StreamingResponseBody`, removes hop-by-hop headers, and removes `Content-Length` because the response is streamed.

## OpenAPI size management

The complete spec remains available, but day-to-day browsing should use the split specs. This keeps Swagger and Scalar usable when many organisms and views are configured.

## Documentation navigation

Swagger and Scalar pages include a small Loculus bar with a home link, a spec selector, and a Data Use Terms notice when configured.

## Compatibility proxy

The `/{organism}/lapis/**` proxy remains temporary. New website and API documentation work should prefer `/query`.

