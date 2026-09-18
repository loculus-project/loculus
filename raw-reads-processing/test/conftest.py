def pytest_addoption(parser):
    parser.addoption(
        "--skip-missing-deps",
        action="store_true",
        default=False,
        help="Skip tests that need external tools (deacon binary, readtools "
        "jar) instead of failing them when those tools aren't available.",
    )
