# Notification bell: sequences awaiting review

## Motivation

New users don't discover the submission **approval** step. After uploading, sequences sit
unapproved (not released) and users are surprised they don't appear (see
[#6669](https://github.com/loculus-project/loculus/issues/6669)). Reaching the review page today
takes several clicks and requires first selecting the correct organism, then Submit, then Review —
2–3 extra clicks if you start on the wrong organism, and new users don't know the path exists.

A notification bell in the top-right header (a familiar web pattern) collapses this to one click:
click the bell → drawer lists organism/group pairs with unapproved submissions → click a row →
deep-link straight to that group's review page.

## Scope of the first version

- **Bell + drawer only.** No badge on the Submit button; no mobile sandwich-menu bell (follow-up).
- **Muted bell always shown when logged in.** Grey bell with no badge when there is nothing to
  review; primary-coloured bell with a red count badge when there is. Not rendered at all when
  logged out, to avoid layout shift.
- **No dismissal.** The bell always reflects current state. See "Future: dismissal" below.

## Count semantics (deliberately cheap)

The count is computed from the base `sequence_entries` table with `released_at IS NULL`, grouped by
`organism` + `group_id`. This **avoids the join** on `sequence_entries_preprocessed_data` that the
`sequence_entries_view` status derivation requires, keeping it cheap and index-friendly.

Trade-off: the count includes everything not yet released (RECEIVED / IN_PROCESSING / PROCESSED), so
some counted sequences may still be processing rather than strictly awaiting approval. This is
acceptable for a "you have pending work here" nudge. If an exact "awaiting approval" count is ever
needed, narrow the query to `Status.PROCESSED` via `SequenceEntriesView` instead (documented in code
on `ReviewCount` and `getReviewCounts`).

A partial index backs the query:
`migration V1.34__index_unreleased_sequence_entries.sql` →
`CREATE INDEX ... ON sequence_entries (organism, group_id) WHERE released_at IS NULL;`

## Backend

- **Endpoint:** `GET /my/review-counts` (root-level, not organism-scoped). New controller
  `NotificationController.kt`, modelled on `AdminDashboardController` (the existing
  `SubmissionController` is locked to `@RequestMapping("/{organism}")`).
- **Response:** `List<ReviewCount>` where `ReviewCount(organism, groupId, count)`
  (`api/SubmissionTypes.kt`). Only groups with count > 0 are returned (a by-product of `GROUP BY`).
- **Service:** `SubmissionDatabaseService.getReviewCounts(authenticatedUser)`. Scopes to the user's
  groups (super users see all) — the same group-visibility rule as `getSequences`, but the condition
  is built against `SequenceEntriesTable` (not the view) so the SQL stays on the base table.
- **Tests:** `GetReviewCountsEndpointTest.kt` (unauthorized, empty, count-per-group, non-member
  isolation).

## Website

- **Component:** `components/Navigation/NotificationBell.tsx`, wrapped in `withQueryProvider`.
  - `backendClientHooks(clientConfig).useGetReviewCounts(...)` polled every 30 s — a single
    aggregated call (no per-organism fan-out).
  - `groupManagementClientHooks(clientConfig).useGetGroupsOfUser(...)` to label rows with group
    names (added `groupManagementClientHooks` to `services/serviceHooks.ts`).
  - Headless-UI `Menu` popover (same pattern as `OrganismNavigation.tsx`). Each row deep-links via
    `routes.userSequenceReviewPage(organism, groupId)` — never hand-built.
  - `MenuButton` is `disabled` until hydration (`useClientFlag`) to avoid flaky Playwright races.
- **Endpoint definition:** `getReviewCounts` in `services/backendApi.ts`; `reviewCount` /
  `reviewCountsResponse` zod schemas in `types/backend.ts`.
- **Mount:** `components/Navigation/Navigation.astro`, in the desktop right-hand nav cluster, gated
  on `isLoggedIn && accessToken !== undefined`.

## Future: dismissal (not implemented)

To add later without reworking the above: have `getReviewCounts` also return `latestSubmittedAt` per
(organism, group) — `max(submitted_at)` over the unreleased rows, still base-table only. The
frontend stores in `localStorage` a map of `"{organism}:{groupId}" → dismissedAt`; a row is "seen"
(excluded from the badge, still listed in the drawer) when `latestSubmittedAt <= dismissedAt`.
Clicking a row or a "mark all read" control writes `dismissedAt = now`; a newer submission
re-surfaces it. No backend state or extra endpoint needed.

## Follow-ups

- Add the bell to the mobile `SandwichMenu`.
- Optional numeric badge on the Submit nav item.
