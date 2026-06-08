# Runtime View

For a website request, the user session is converted into a bearer token and sent to the backend query API. The backend resolves the organism config, computes the access filter, combines it with the requested LAPIS query, and forwards the result to LAPIS.

In the demonstration access model, unauthenticated users receive no private sequence data, superusers receive all sequence data, and regular users receive sequences submitted by groups they belong to.
