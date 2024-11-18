# Crosscutting Concepts

## Logging

Log messages are written directly to stdout so that they can be collected by the container orchestrator.

## Request Tracing

Where possible, APIs should implement request ids:
* The API should accept a request id in the request header.
* The API must include the request id in the response header. If no request id is provided, the API should generate one.
* The API must include the request id in all log messages.

This allows for tracing of requests through the system.
It is also helpful if services log the request id that they receive from a service that they consume.

In Spring Boot, implementing request ids is quite straight forward with `@RequestScope`.
Also see [the implementation in the backend](https://github.com/loculus-project/loculus/blob/cbbbc9746604679df225059af6683ebcb568e038/backend/src/main/kotlin/org/loculus/backend/log/RequestId.kt).
