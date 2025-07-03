# Frequently Asked Questions

## General Python

### What's that `Final` type?

`Final` is a type hint that indicates a variable's value should not be changed once it's assigned. It's part of the `typing` module in Python and is used to define constants or to prevent method overriding in subclasses.

Essentially what `const` is in TS, or unmutable in Rust.

Not mutating variables is a good practice, it makes reasoning about the code easier.

## Integration tests

### How to run a single test?

```sh
pytest scripts/test_ena_submission_integration.py::TestSimpleSubmission::test_submit
```

### How do the mocks work?

Using `SubmissionTests` as an example:

```py
@patch("ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata")
@patch("ena_deposition.call_loculus.get_group_info")
def test_submit(self, mock_get_group_info, mock_submit_external_metadata):
    """
    Test the full ENA submission pipeline with accurate data - this should succeed
    """
    simple_submission(
        self.db_config, self.config, mock_get_group_info, mock_submit_external_metadata
    )
```

- `@patch` is a decorator that replaces the specified function with a mock object.
- The mock objects are passed as arguments to the test function in the reverse order that they are defined in
- Mock objects allow us to modify their behavior. By default, they return `None`, but we can set them up to return specific values or raise exceptions.

The behavior is specified in the test function itself in this case, inside `simple_submission`:

```py
def simple_submission(
    db_config: SimpleConnectionPool,
    config: Config,
    mock_get_group_info,
    mock_submit_external_metadata,
):
    # get data
    mock_get_group_info.return_value = get_dummy_group()
    mock_submit_external_metadata.return_value = mock_requests_post()
    ...
```

Specifically, `mock_get_group_info` is set to return a dummy group, and `mock_submit_external_metadata` is set to return a mock response from a POST request.

When the patched methods are called in the code under test, they will use the mock objects instead of the real implementations.

## How do I run pytest

All tests can be run normally with `python3 test_file.py` or with `pytest`.

Pytest automatically discovers and runs tests that follow a naming convention:

- Files named: `test_*.py` or `*_test.py`
- Functions starting with: `test_`
- Classes starting with: `Test` (but not classes with `__init__`)
- Methods inside those classes starting with: `test_`

Therefore, if you define helper functions in a test file they should not start with `test` or they will also be executed by pytest as an additional test.
