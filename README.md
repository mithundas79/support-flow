# Support Flow

Human-reviewed AI support automation with n8n, OpenAI and a React walkthrough.

> Work in progress. The initial foundation is being implemented against the [tracked acceptance criteria](https://github.com/mithundas79/support-flow/issues). There is no verified live demo yet.

The public demo will use fictional support tickets and will never send email. The local boilerplate will use server-side credentials, a single trusted reviewer, PostgreSQL persistence and n8n orchestration. Mailpit will be the default delivery sink; real Gmail delivery requires explicit configuration.

## Development

Use Node.js 22 LTS and npm 10. Install with `npm ci`, then run `npm run build`, `npm run typecheck`, and `npm test`.

## License

Authored code is MIT licensed. n8n is a separate dependency distributed under its own license; this repository does not relicense n8n or claim it is MIT licensed.
