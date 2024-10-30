# Integration tests

These are tests of the full Loculus system, following sequences through submission to preprocessing to release.

## Principles

Here are some current guiding principles for these tests:
- Only use facilities users could use (primarily browser interaction), rather than setting things up with backend calls. This makes it easy for others to understand the tests because they can follow them in the browser.
- All tests should be able to run in parallel. Mostly this can be carried out by creating a separate user/group for each test.