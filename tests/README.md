# Tests

- `core.test.cjs`: dependency-free Node.js suite run through `npm test` and GitHub Actions.
- Browser smoke workflows have additionally been checked in Chromium using Playwright; that Python-only harness is not part of CI because it needs a browser and Playwright installation.
