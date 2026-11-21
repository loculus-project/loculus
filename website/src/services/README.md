# Calling the backend and LAPIS from the website

All requests to our own APIs (the Loculus backend, LAPIS and the website's own JSON routes) go through one request
function and one endpoint catalogue per service. This page explains how to add an endpoint and how to call it from
server-side code (Astro pages, API routes) and from client-side code (React components).

## Overview

| Layer               | File                                             | What it does                                                                                                  |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Request core        | `services/apiRequest.ts`                         | `sendRequest` (axios), `apiPath`, `getErrorMessage`, `getErrorStatus`                                         |
| Endpoint catalogues | `services/backendApi.ts`, `services/lapisApi.ts` | Every endpoint, defined once, as a function that **throws** on errors                                         |
| Server-side         | `services/serverApi.ts`, `services/result.ts`    | `serverBackendApi(token)`, `serverLapisApi(organism)`: the same endpoints, returning neverthrow **`Result`s** |
| Client-side hooks   | `hooks/useBackend.ts`, `hooks/useLapis.ts`       | `useBackendQuery`, `useBackendMutation`, `useLapisQuery`, `useLapisMutation` on React Query                   |

So an endpoint is defined once in a catalogue, and is then available server-side, in hooks and in plain async code
without further changes.

## Adding a backend endpoint

### 1. Define the response schema

Response schemas are zod schemas in `src/types/` (e.g. `types/backend.ts`, `types/seqSetCitation.ts`), next to the
inferred type:

```ts
export const groupDetails = z.object({ group /* , ... */ });
export type GroupDetails = z.infer<typeof groupDetails>;
```

### 2. Add the endpoint to `backendApi.ts`

Add a function to the object returned by `backendApi`, in the section of its domain (submission, groups, seqsets, ...).
For example, this is how `getGroupDetails` and `editGroup` are defined:

```ts
getGroupDetails: ({ groupId }: { groupId: number }, { signal }: RequestOptions = {}) =>
    sendRequest(backendUrl, {
        method: 'get',
        path: apiPath`/groups/${groupId}`,
        headers,
        signal,
        responseSchema: groupDetails,
    }),

editGroup: ({ groupId, ...newGroup }: NewGroup & { groupId: number }) =>
    sendRequest(backendUrl, {
        method: 'put',
        path: apiPath`/groups/${groupId}`,
        data: newGroup,
        headers,
        responseSchema: group,
    }),
```

Conventions:

- **One params object.** The first argument holds the path parameters plus the query parameters (`params`) or body
  (`data`). Endpoints without parameters take `_params?: undefined`. The generic hooks rely on this: the params object
  becomes the query key and the mutation variables.
- **`{ signal }` as optional second argument** for endpoints that read data, so React Query can cancel them.
- **Use `apiPath` for any dynamic path segment.** It URL-encodes the values and throws if one is missing, so we never
  send a request to e.g. `/groups/undefined`.
- **Pass `headers`** (the `Authorization` header built from the access token) if the endpoint needs authentication.
- **Always pass a `responseSchema`** if the endpoint returns a body. The response is validated, and the return type
  is inferred from the schema. Leave it out if the response body isn't used (the function then returns `void`).
  Only use `unvalidated<T>()` for very large responses where validation is too expensive, and say why in a comment
  (see `getSeqSetRecords`).
- **Multipart uploads:** pass `data: toFormData(files)`. **File downloads:** pass `responseType: 'blob'` and
  `responseSchema: z.instanceof(Blob)`; error responses stay readable for `getErrorMessage`.
- **Name the function after the operation** (`getGroupDetails`, `approveProcessedData`), not after the URL.

That's it: the endpoint can now be used everywhere below.

## Using an endpoint server-side (Astro pages and API routes)

Use `serverBackendApi(accessToken)` from `services/serverApi.ts`. It has the same functions as `backendApi`, but each
returns a `Result<T, ProblemDetail>` instead of throwing. Errors are logged and converted into a `ProblemDetail`.

```astro
---
import { serverBackendApi } from '../../../services/serverApi.ts';

const groupDetailsResult = await serverBackendApi(accessToken).getGroupDetails({ groupId });
---

{groupDetailsResult.match(
    (groupDetails) => (
        <GroupEditForm prefetchedGroupDetails={groupDetails} client:load />
    ),
    (problemDetail) => (
        <ErrorBox>Failed to fetch group details: {problemDetail.detail}</ErrorBox>
    ),
)}
```

Server-side requests time out after 30 seconds (`SERVER_SIDE_TIMEOUT_MS`), so a slow service can't block a page
forever. `serverApi.ts` reads the server-side runtime config, so never import it from client-side code.

## Using an endpoint client-side (React)

### Reading data: `useBackendQuery`

```ts
const { data, error, isLoading } = useBackendQuery(
    { clientConfig, accessToken },
    'getDataToEdit',
    { organism, accession, version },
    { enabled: isOpen },
);
```

The arguments are the context (where to send the request and with which token), the endpoint name, its params object,
and optional React Query options. The params and the return type are inferred from the catalogue.

The query key is `['backend', endpoint, params]`. The access token is deliberately not part of it: it's a secret, and
it doesn't change during a page's lifetime.

### Changing data: `useBackendMutation`

The mutation variables are the endpoint's params object:

```ts
const approve = useBackendMutation({ clientConfig, accessToken }, 'approveProcessedData', {
    onSuccess: () => refetchSequences(),
    onError: (error) => toast.error(`Failed to approve sequences: ${getErrorMessage(error)}`),
});

approve.mutate({ organism, scope: 'ALL', groupIdsFilter: [groupId] });
```

### Imperative calls outside React Query

For flows that don't fit a hook (e.g. multi-step uploads, or a form that awaits the result), call the catalogue
directly and handle errors with try/catch:

```ts
const backend = backendApi(clientConfig.backendUrl, accessToken);
try {
    const editedGroup = await backend.editGroup({ groupId, ...group });
} catch (error) {
    setErrorMessage(`Failed to edit group: ${getErrorMessage(error)}`);
}
```

### Errors

- Show errors to users with `getErrorMessage(error)`, usually as `` `Failed to do X: ${getErrorMessage(error)}` ``.
  It understands backend and LAPIS problem details, axios errors, `ResponseValidationError`s and plain `Error`s.
- Use `getErrorStatus(error)` if you need the HTTP status (e.g. `=== 503`). Don't import axios in components.
- Never show `JSON.stringify(error)` to users.

### Where to put hooks

- **Generic API hooks** live in `src/hooks/` (`useBackend.ts`, `useLapis.ts`). You normally don't need to add any.
- **Feature hooks** that combine API calls with UI behaviour (toasts, error banners, local state) live next to the
  component that uses them, e.g. `components/ReviewPage/useSubmissionOperations.ts`.

### Combining several requests in one query

If one query needs several requests (e.g. one LAPIS request per organism), use `useQuery` with your own `queryFn`
that calls the catalogue. Build the key like the generic hooks do, and only include the plain inputs of the query:

```ts
useQuery({
    queryKey: ['lapis', 'groupSequenceCounts', { groupId, lapisUrls, organismKeys }],
    queryFn: () => fetchSequenceCounts(groupId, lapisUrls, organismKeys),
});
```

Query keys start with `'backend'`, `'lapis'` or `'website'`, and never contain tokens or whole config objects.

## LAPIS endpoints

LAPIS works the same way:

- Add the endpoint to `lapisApi(lapisUrl)` in `services/lapisApi.ts`. Helpers built on several requests, or on one
  request plus extra validation, go in the same object (e.g. `getLatestAccessionVersion`). To return a specific
  error from a helper, throw a `ProblemDetailError`.
- Server-side: `serverLapisApi(organism).details({ ... })` returns a `Result`.
- Client-side: `useLapisQuery(lapisUrl, 'lineageDefinition', { column })` or
  `useLapisMutation(lapisUrl, 'aggregated')`. LAPIS hooks retry failed requests automatically, because LAPIS
  requests only read data, even when they use POST.
- Imperative: `await lapisApi(lapisUrl).aggregated({ ... })`.

LAPIS doesn't need an access token.

## Testing

Mock requests at the network level with [MSW](https://mswjs.io/) and `testServer` from `vitest.setup.ts`. In tests,
`testConfig.serverSide.backendUrl` and `testConfig.public.backendUrl` are the same URL, so one handler covers server-side
and client-side code:

```ts
testServer.use(http.get(`${testConfig.serverSide.backendUrl}/groups/1`, () => Response.json(groupDetails)));
```

`mockRequest.backend` and `mockRequest.lapis` in `vitest.setup.ts` contain handlers for common endpoints.

## Requests that don't use `sendRequest`

These are deliberate exceptions. Don't move them to `sendRequest`:

- `pages/seq/[accessionVersion]/[fileCategory]/[fileName].ts` streams files from the backend to the browser with
  `fetch`, without validating them.
- Calls to external services or static files: Crossref (`AddSeqSetCitationForm`), S3 presigned uploads
  (`utils/multipartUpload.ts`), the link check in `DataTableEntryValue`, `search-index.json` (`DocsSearch`), the
  banner URL (`bannerMessageService`) and client logs (`clientLogger`).

## Checklist for a new endpoint

1. Response schema in `src/types/`.
2. Endpoint in `backendApi.ts` or `lapisApi.ts`: one params object, `apiPath` for dynamic segments, `responseSchema`.
3. Server-side: `serverBackendApi(token).yourEndpoint(...)` and handle the `Result`.
4. Client-side: `useBackendQuery` / `useBackendMutation` (or `useLapis…`), or the catalogue with try/catch.
5. Show errors with `getErrorMessage`.
6. Test with MSW handlers.
