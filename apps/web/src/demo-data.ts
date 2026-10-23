import type { Ticket } from '@support-flow/contracts';

const at = '2026-01-15T09:30:00.000Z';
export function initialTickets(): Ticket[] {
  return [
    {
      id: 'ns-1042', externalId: 'sample-webhook-401', subject: 'Our webhook keeps returning 401',
      customerName: 'Maya Chen', customerEmail: 'maya@atelier.example', category: 'integration', priority: 'normal', status: 'awaiting_review',
      body: 'Hi Northstar team,\n\nWe rotated our API key this morning and our order webhook has returned 401 ever since. The endpoint is reachable and our other API calls work. Is there a separate secret we need to update?\n\nThanks,\nMaya',
      summary: 'Webhook authentication fails after an API key rotation. The signing secret is managed separately from API keys.',
      draft: 'Hi Maya,\n\nThanks for the clear details. Northstar webhook signing secrets are separate from API keys, so rotating an API key does not update your webhook secret.\n\nOpen Settings → Integrations → Webhooks, select your endpoint, and check that the signing secret in your receiving service matches the current webhook secret. Keep the secret on your server and never include it in a reply.\n\nOnce they match, use “Send test event” on the endpoint page to verify the connection. If the test still returns 401, please share the event ID and timestamp, with any credentials removed.\n\nBest,\nNorthstar Support',
      draftVersion: 1,
      sources: [{ id: 'kb-webhook-auth', title: 'Troubleshoot webhook authentication', excerpt: 'Webhook signing secrets are independent of API keys. After a key rotation, confirm that the receiving service uses the current signing secret in Settings → Integrations → Webhooks. Use Send test event to verify your endpoint. Never share secrets in support replies.' }],
      events: [
        { id: '1042-1', type: 'received', message: 'Sample email added to the inbox.', createdAt: at },
        { id: '1042-2', type: 'retrieved', message: 'Prepared example matched to the webhook authentication article.', createdAt: '2026-01-15T09:30:02.000Z' },
        { id: '1042-3', type: 'drafted', message: 'Prepared draft is ready for a human review.', createdAt: '2026-01-15T09:30:04.000Z' },
      ], createdAt: at, updatedAt: at,
    },
    {
      id: 'ns-1041', externalId: 'sample-sso-details', subject: 'Can you help us set up SSO?',
      customerName: 'Leo Martin', customerEmail: 'leo@forma.example', category: 'access', priority: 'normal', status: 'awaiting_review',
      body: 'Hello!\n\nWe would like to turn on SSO for our team. I tried following the setup but got stuck. Can you tell me what to do next?\n\nLeo',
      summary: 'The identity provider and exact error are missing. Ask for these details before suggesting provider-specific steps.',
      draft: 'Hi Leo,\n\nHappy to help you get SSO working. Could you tell us which identity provider you use and where you got stuck? The exact error message or a screenshot with personal details removed would help.\n\nPlease also confirm that you are a workspace admin. Do not send passwords, private keys, or SSO secrets. With those details, we can point you to the right next step.\n\nBest,\nNorthstar Support',
      draftVersion: 1,
      sources: [{ id: 'kb-sso-checklist', title: 'Before you configure single sign-on', excerpt: 'SSO setup requires a workspace admin. Confirm the identity provider and capture the exact error before troubleshooting. Never request passwords, private keys, or identity-provider secrets in a support conversation.' }],
      events: [
        { id: '1041-1', type: 'received', message: 'Sample email added to the inbox.', createdAt: '2026-01-15T09:18:00.000Z' },
        { id: '1041-2', type: 'drafted', message: 'Prepared clarification asks for missing information.', createdAt: '2026-01-15T09:18:03.000Z' },
      ], createdAt: '2026-01-15T09:18:00.000Z', updatedAt: '2026-01-15T09:18:03.000Z',
    },
    {
      id: 'ns-1040', externalId: 'sample-billing-escalation', subject: 'Refund and billing email change',
      customerName: 'Amara Okafor', customerEmail: 'amara@mono.example', category: 'billing', priority: 'high', status: 'needs_attention',
      body: 'Hi,\n\nWe were charged twice this month. Please refund the second charge and change the billing email to my new address. I no longer have access to the old billing inbox.\n\nThank you,\nAmara',
      summary: 'A refund and billing identity change require account verification by a human specialist. The draft cannot be approved through routine review.',
      draft: 'Hi Amara,\n\nThanks for flagging this. A billing specialist needs to review the possible duplicate charge and verify the account before making a refund or changing the billing email.\n\nPlease do not send payment-card details or passwords. I am passing your request to our billing team so they can guide you through the verification steps.\n\nBest,\nNorthstar Support',
      draftVersion: 1, sources: [],
      events: [
        { id: '1040-1', type: 'received', message: 'Sample email added to the inbox.', createdAt: '2026-01-15T09:05:00.000Z' },
        { id: '1040-2', type: 'escalated', message: 'Sensitive billing and identity changes require a human specialist. Routine approval is blocked.', createdAt: '2026-01-15T09:05:02.000Z' },
      ], createdAt: '2026-01-15T09:05:00.000Z', updatedAt: '2026-01-15T09:05:02.000Z',
    },
  ];
}
