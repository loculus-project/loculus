# Contributing to Loculus

Contributions are very welcome! Just fork the repository, develop in a branch and submit a pull request.

### Commit Messages

We follow [conventional commits](https://www.conventionalcommits.org) when writing commit messages.
  The messages themselves should help future developers understand __why__ changes were made. Changes which will break known deployments (e.g. Pathoplexus) should be marked with an exclamation mark e.g. `feat!:` or `fix!:` and `[CFG]` can be used to indicate that they are breaking because they require changes to the values.yaml configuration.

### Code Style

We value clean code, here are some guidelines on what we consider clean code:
* Use expressive names (variables, classes, function), avoid abbreviations unless they are really common sense
* Small functions and classes
* Reasonable test coverage: We don't require 100% test coverage, but we do require tests for all non-trivial code.
  End-to-end tests should be __expressive__ and cover the most important use cases.
  Every piece of the code should at least be tested in the happy path.
* Develop code with testability in mind.

Keep in mind that Loculus is designed to be run and maintained by anyone. 
This means that the code that we develop needs to be suitably general and configurable.

### OpenAPI docs

The backend offers a Swagger UI and an OpenAPI specification.
Try to keep the OpenAPI specification as correct and as useful as possible.
