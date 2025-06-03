To run integration tests use a command like

NODE_TLS_REJECT_UNAUTHORIZED=0 BASE_URL=https://main.loculus.org npx playwright test --workers=2 tests/specs/auth/login.spec.ts tests/specs/auth/registration.spec.ts


[on whatever files are relevant]

You can also run tests with just one browser to make things faster

If the test fails you must keep debugging it until it passes - don't submit failing tests at all
