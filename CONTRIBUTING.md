# Contributing to Loculus

Contributions are very welcome! Just fork the repository, develop in a branch and submit a pull request.

### Commit Messages

We follow [conventional commits](https://www.conventionalcommits.org) when writing commit messages.
The messages themselves should help future developers understand __why__ changes were made.

### Code Style

We value clean code, here are some guidelines on what we consider clean code:

* Use expressive names (variables, classes, function), avoid abbreviations unless they are really common sense
* Avoid comments - use expressive names instead.
* Small functions and classes
* Develop code with testability in mind.

Keep in mind that Loculus is designed to be run and maintained by anyone.
This means that the code that we develop needs to be suitably general and configurable.

### Testing

We have different testing concepts for the individual parts of the application:

#### Website

* React components should be covered by unit tests unless they are trivial.
* Astro components, to our knowledge, can't be unit tested. Thus, we have to rely on end-to-end tests for them.
* End-to-end tests:
    * End-to-end tests should be __expressive__ and cover the most important use cases.
    * End-to-end tests __document__ available features.
      Thus, every important feature should at least be tested in the happy path.
      Newcomers to the code should be able to gain insight into the application's features by looking at the end-to-end
      tests.
    * End-to-end tests should provide some confidence that the application technically works (e.g., navigation works).
      This is especially important when doing dependency updates and other refactorings.

#### Backend

In the backend, we can utilize Spring's testing capabilities.
We strive for full test coverage in the backend, covering both happy paths and the most important error cases.

Most tests cover the controller endpoints in an integration test manner with a real Postgres database provided by
[testcontainers](https://testcontainers.com/).
Only parts of the application that have non-trivial logic isolated from the underlying database are unit tested.

#### Preprocessing Pipelines

Currently, the preprocessing pipelines are not tested.
At the time of writing, the preprocessing pipelines are still in a very early stage and are subject to change.
In the long run, we should establish a testing concept for the preprocessing pipelines that verifies the main logic.

### OpenAPI docs

The backend offers a Swagger UI and an OpenAPI specification.
Try to keep the OpenAPI specification as correct and as useful as possible.
