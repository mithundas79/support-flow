# Review workspace

The React application has two adapters behind one review interface. The default public build uses prepared fictional Northstar tickets and browser storage. It does not call an API, an AI provider, or an email service. A recorded sample approval never sends a message.

The local API build uses same-origin `/api/v1` requests and an HttpOnly reviewer session. The reviewer token is cleared from the login field after submission and is never persisted. The authenticated runtime label distinguishes a fixture provider from configured OpenAI; configuration alone does not claim a successful provider call.

## Run

From the repository root, use the supported Node version and the locked install:

```sh
npm ci
npm run build --workspace @support-flow/contracts
npm run dev:web
```

To use the real local API, set `VITE_API_MODE=live` in the environment before starting Vite. The Vite development proxy forwards `/api` to `http://127.0.0.1:3000`. Set the API's `APP_ORIGIN` to the frontend origin; refer to the root setup guide for services and credentials.

The production base path is `/support-flow/`. Hash routes keep ticket URLs refresh-safe on GitHub Pages. No client-side provider credential is required.

## Verify

```sh
npm run build --workspace @support-flow/web
npm run test --workspace @support-flow/web
npm run test:e2e --workspace @support-flow/web
```

The browser suite starts a production preview on port 4175. To check an existing loopback preview, set `WEB_DEMO_URL=http://127.0.0.1:4173/support-flow/`. To verify the published site instead, set `PUBLISHED_DEMO_URL=https://mithundas79.github.io/support-flow/`. An optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects an installed Chromium executable when the default Playwright browser is unavailable.

Tests cover versioned review, escalation and source gating, persistence recovery, idempotency, session requests, React rendering, and real desktop/mobile browser interactions. Cross-tab mutations use the browser Web Locks API when available, then re-read current storage and validate the expected draft version. A simultaneous edit does not silently approve an unseen draft. Browsers without Web Locks still validate versions, but cannot serialize truly simultaneous writes; use one tab in those browsers.

Local verification used Node 20.20.2 and cached public dependencies because this host did not provide Node 22 or a complete fresh-install registry path. This does not substitute for the repository's Node 22 CI and full local-stack checks. No live provider execution or public deployment is claimed by these app tests.
