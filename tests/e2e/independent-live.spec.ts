import { expect, test } from '@playwright/test';
import { assertApprovedMailText } from '../mail-content.mjs';

test('W05: authenticated UI reviews a real n8n-created fixture draft', async ({ page, request }) => {
  test.skip(!process.env.PLAYWRIGHT_LIVE_URL, 'Set PLAYWRIGHT_LIVE_URL to a live-mode web server connected to the disposable fixture stack.');
  const reviewerToken = process.env.REVIEWER_TOKEN;
  const workflowToken = process.env.WORKFLOW_TOKEN;
  expect(reviewerToken, 'REVIEWER_TOKEN is required for live UI verification').toBeTruthy();
  expect(workflowToken, 'WORKFLOW_TOKEN is required for live UI verification').toBeTruthy();
  const n8nURL = process.env.ACCEPTANCE_N8N_URL ?? 'http://127.0.0.1:5678';
  const fixtureURL = process.env.ACCEPTANCE_FIXTURE_URL ?? 'http://127.0.0.1:4010';
  const mailpitURL = process.env.ACCEPTANCE_MAILPIT_URL ?? 'http://127.0.0.1:8025';
  const externalId = `browser-${Date.now()}-${test.info().project.name}`;
  expect((await request.post(`${fixtureURL}/__control`, { data: { externalId, scenario: 'normal' } })).ok()).toBe(true);
  const intake = await request.post(`${n8nURL}/webhook/northstar-intake`, {
    headers: { authorization: `Bearer ${workflowToken}` },
    data: {
      externalId, subject: `Fictional browser webhook ${externalId}`,
      body: 'How do I verify the Northstar webhook signature and timestamp?',
      customerName: 'Fictional Browser Customer', customerEmail: `${externalId}@example.test`,
    },
  });
  expect(intake.ok()).toBe(true);
  const { ticket } = await intake.json();
  expect(ticket.id).toBeTruthy();
  expect((await request.post(`${n8nURL}/webhook/northstar-process`, {
    headers: { authorization: `Bearer ${workflowToken}` }, data: { ticketId: ticket.id },
  })).ok()).toBe(true);
  const stats = await request.get(`${fixtureURL}/__control/stats`);
  expect(stats.ok()).toBe(true);
  const calls = (await stats.json()).requests.filter((entry: { externalId: string }) => entry.externalId === externalId);
  expect(calls.length, 'actual n8n must call fixture classification, embedding and drafting').toBeGreaterThanOrEqual(3);
  expect(calls.length).toBeLessThanOrEqual(9);

  const errors: string[] = [];
  const remoteRequests: string[] = [];
  const appOrigin = new URL(process.env.PLAYWRIGHT_LIVE_URL!).origin;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', value => {
    if (/^https?:/.test(value.url()) && new URL(value.url()).origin !== appOrigin) remoteRequests.push(value.url());
  });
  await page.goto(process.env.PLAYWRIGHT_LIVE_URL!);
  await expect(page.getByLabel('Reviewer token')).toBeVisible();
  await page.getByLabel('Reviewer token').fill(reviewerToken!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search tickets' }).fill(externalId);
  await page.getByRole('link', { name: new RegExp(`Fictional browser webhook ${externalId}`) }).click();
  await expect(page.getByRole('button', { name: 'Approve draft', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Revise draft', exact: true }).click();
  const text = 'Fictional authenticated reviewer revision. Verify the webhook signing secret server-side.';
  await page.getByRole('textbox', { name: 'Reply draft' }).fill(text);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('VERSION 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft approved.');
  expect((await request.post(`${n8nURL}/webhook/northstar-dispatch`, {
    headers: { authorization: `Bearer ${workflowToken}` }, data: {},
  })).ok()).toBe(true);
  const recipient = `${externalId}@example.test`;
  await expect.poll(async () => {
    const response = await request.get(`${mailpitURL}/api/v1/messages`);
    expect(response.ok()).toBe(true);
    const messages = (await response.json()).messages as Array<{ ID: string; To: Array<{ Address: string }> }>;
    return messages.filter(message => message.To.some(to => to.Address === recipient)).length;
  }, { message: 'real Mailpit must contain exactly one approved browser revision' }).toBe(1);
  const messages = (await (await request.get(`${mailpitURL}/api/v1/messages`)).json()).messages as Array<{ ID: string; To: Array<{ Address: string }> }>;
  const delivered = messages.find(message => message.To.some(to => to.Address === recipient))!;
  const content = await (await request.get(`${mailpitURL}/api/v1/message/${delivered.ID}`)).json();
  const mailEvidence = assertApprovedMailText(content.Text, text);
  console.log('BROWSER_MAIL_CONTENT_TRACE', JSON.stringify({ ticketId: ticket.id, ...mailEvidence }));
  await page.reload();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  const storedValues = await page.evaluate(() => [Object.values(localStorage), Object.values(sessionStorage)].flat());
  expect(storedValues.join('\n')).not.toContain(reviewerToken!);
  expect(errors).toEqual([]);
  expect(remoteRequests, 'browser must reach providers only through the local server workflow').toEqual([]);
});
