import { test, expect, type Page } from '@playwright/test';

async function openTicket(page: Page, subject = 'Our webhook keeps returning 401') { await page.getByRole('link', { name: new RegExp(subject) }).click(); await expect(page.getByRole('heading', { level: 1, name: subject })).toBeVisible(); }
test.beforeEach(async ({ page }) => { await page.goto('./'); await page.evaluate(() => localStorage.removeItem('support-flow.demo.v1')); await page.reload(); });

test('search, filters, source inspection, versioned edit, approval and reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByText('Interactive sample · no emails sent', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search tickets' }).fill('no match at all');
  await expect(page.getByRole('heading', { name: 'No tickets found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  await page.getByRole('button', { name: 'Needs attention', exact: false }).click();
  await expect(page.getByRole('link', { name: /Refund and billing email change/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Our webhook/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'All tickets', exact: false }).click();
  await openTicket(page);
  await page.getByRole('button', { name: /Troubleshoot webhook authentication/ }).click();
  await expect(page.locator('.source-excerpt')).toContainText('independent of API keys');
  await page.getByRole('button', { name: 'Revise draft' }).click();
  const editor = page.getByRole('textbox', { name: 'Reply draft' });
  await expect(editor).toBeFocused();
  await editor.fill('Hi Maya,\n\nPlease verify your separate webhook signing secret.\n\nNorthstar Support');
  await expect(page.getByRole('button', { name: 'Approve draft' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('VERSION 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve draft' }).click();
  await expect(page.locator('.decision-result')).toContainText('Approved');
  await page.reload();
  await expect(page.locator('.decision-result')).toContainText('No email was sent');
  await page.getByText('Activity timeline').click();
  await expect(page.locator('.timeline')).toContainText('Version 2 approved');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('sensitive request blocks approval; rejection and reset are durable', async ({ page }) => {
  await openTicket(page, 'Refund and billing email change');
  await expect(page.getByRole('button', { name: 'Approve draft' })).toBeDisabled();
  await expect(page.locator('.no-sources')).toContainText('human specialist');
  await page.getByRole('button', { name: 'Reject draft' }).click();
  await page.getByRole('textbox', { name: 'Reason for rejection' }).fill('Billing specialist must verify identity and the duplicate charge.');
  await page.getByRole('button', { name: 'Confirm rejection' }).click();
  await expect(page.locator('.decision-result')).toContainText('Rejected');
  await page.reload();
  await expect(page.locator('.decision-result')).toContainText('Rejected');
  await page.getByRole('button', { name: 'Back to inbox' }).click();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await openTicket(page, 'Refund and billing email change');
  await expect(page.getByRole('button', { name: 'Reject draft' })).toBeEnabled();
  await expect(page.getByText('VERSION 1', { exact: true })).toBeVisible();
});

test('stale edits show useful feedback and preserve unsaved text across tabs', async ({ page, context }) => {
  await openTicket(page); await page.getByRole('button', { name: 'Revise draft' }).click();
  await page.getByRole('textbox', { name: 'Reply draft' }).fill('My unsaved draft from the first tab.');
  const second = await context.newPage(); await second.goto('./#/tickets/ns-1042');
  await second.getByRole('button', { name: 'Revise draft' }).click();
  await second.getByRole('textbox', { name: 'Reply draft' }).fill('A newer draft from another tab.');
  await second.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('A newer version is available.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText('changed in another tab');
  await expect(page.getByRole('textbox', { name: 'Reply draft' })).toHaveValue('My unsaved draft from the first tab.');
  await page.getByRole('button', { name: 'Cancel editing' }).click();
  await expect(page.locator('.draft-content')).toContainText('A newer draft from another tab.');
  await second.close();
});

test('walkthrough, focus trap, skip link and corrupt storage recovery', async ({ page }) => {
  await page.getByRole('button', { name: 'Take a quick walkthrough' }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('button', { name: 'Open the guided ticket' })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(dialog).toHaveCount(0);
  const current = page.url();
  await page.getByRole('link', { name: 'Skip to main content' }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused(); expect(page.url()).toBe(current);
  await page.evaluate(() => localStorage.setItem('support-flow.demo.v1', '{broken'));
  await page.reload();
  await expect(page.getByRole('status')).toContainText('original examples were restored');
  await expect(page.getByRole('button', { name: 'Approve draft' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('public sample performs no API or provider requests and has no asset errors', async ({ page }) => {
  const unexpected: string[] = []; const failed: string[] = [];
  page.on('request', request => { const url = request.url(); if (/\/api\/|openai\.com|n8n|gmail|googleapis\.com/.test(url)) unexpected.push(url); });
  page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  await page.reload(); await openTicket(page); await page.getByRole('button', { name: 'Approve draft' }).click();
  await expect(page.locator('.decision-result')).toBeVisible();
  expect(unexpected).toEqual([]); expect(failed).toEqual([]);
});

test('custom sample, long content, manual draft and reset remain honest and responsive', async ({ page, context }) => {
  const subject = `Integration-${'unbrokensubject'.repeat(15)}`;
  await page.getByRole('button', { name: 'Add sample email' }).click();
  await page.getByLabel('Customer name').fill('Alex Fictional');
  await page.getByLabel('Customer email').fill('alex@studio.example');
  await page.getByLabel('Subject', { exact: true }).fill(subject);
  await page.getByLabel('Original message').fill(`A fictional question. ${'longmessage'.repeat(180)} <script>window.untrusted=true</script>`);
  await page.getByRole('button', { name: 'Add sample', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: subject })).toBeVisible();
  await expect(page.getByText('VERSION 0', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve draft' })).toBeDisabled();
  await expect(page.locator('.summary')).toContainText('no provider has been called');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { untrusted?: boolean }).untrusted)).toBeUndefined();
  await page.getByRole('button', { name: 'Revise draft' }).click();
  await page.getByRole('textbox', { name: 'Reply draft' }).fill('Manual sample follow-up for a human specialist.');
  // Hold a real cross-tab lock so click completion cannot be mistaken for a durable save.
  const blocker = await context.newPage(); await blocker.goto('./');
  await blocker.evaluate(() => new Promise<void>(acquired => {
    void navigator.locks.request('support-flow.demo.v1', () => new Promise<void>(release => {
      Object.assign(window, { releaseSaveLock: release }); acquired();
    }));
  }));
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('button', { name: /^Saving/ })).toBeDisabled();
  const readSavedDraft = () => page.evaluate(subject => {
    const state = JSON.parse(localStorage.getItem('support-flow.demo.v1')!) as { tickets: { subject: string; draft: string; draftVersion: number }[] };
    const ticket = state.tickets.find(ticket => ticket.subject === subject)!;
    return { draft: ticket.draft, draftVersion: ticket.draftVersion };
  }, subject);
  expect(await readSavedDraft()).toEqual({ draft: '', draftVersion: 0 });
  await blocker.evaluate(() => (window as unknown as { releaseSaveLock: () => void }).releaseSaveLock());
  await expect(page.getByRole('status')).toContainText('Draft saved.');
  await expect(page.locator('.draft-content')).toContainText('Manual sample follow-up');
  await expect(page.getByText('VERSION 1', { exact: true })).toBeVisible();
  await expect.poll(readSavedDraft).toEqual({ draft: 'Manual sample follow-up for a human specialist.', draftVersion: 1 });
  await blocker.close();
  await page.reload();
  await expect(page.locator('.draft-content')).toContainText('Manual sample follow-up');
  await expect(page.getByRole('button', { name: 'Approve draft' })).toBeDisabled();
  await page.getByRole('button', { name: 'Back to inbox' }).click();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page.getByRole('status')).toContainText('Demo reset. The original examples are ready to explore.');
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('support-flow.demo.v1')!) as { tickets: { id: string; draftVersion: number; status: string }[] };
    return state.tickets.map(({ id, draftVersion, status }) => ({ id, draftVersion, status }));
  })).toEqual([
    { id: 'ns-1042', draftVersion: 1, status: 'awaiting_review' },
    { id: 'ns-1041', draftVersion: 1, status: 'awaiting_review' },
    { id: 'ns-1040', draftVersion: 1, status: 'needs_attention' },
  ]);
  await page.reload();
  await expect(page.locator('.ticket-list .ticket-row')).toHaveCount(3);
  await expect(page.getByRole('textbox', { name: 'Search tickets' })).toHaveValue('');
  await page.getByRole('textbox', { name: 'Search tickets' }).fill('Alex Fictional');
  await expect(page.getByRole('heading', { name: 'No tickets found' })).toBeVisible();
});

test('rejecting an unseen newer version is blocked and preserves the reason', async ({ page, context }) => {
  await openTicket(page); await page.getByRole('button', { name: 'Reject draft' }).click();
  await page.getByRole('textbox', { name: 'Reason for rejection' }).fill('Review this wording with a specialist.');
  const second = await context.newPage(); await second.goto('./#/tickets/ns-1042');
  await second.getByRole('button', { name: 'Revise draft' }).click();
  await second.getByRole('textbox', { name: 'Reply draft' }).fill('A changed draft that the first reviewer has not inspected.');
  await second.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('VERSION 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm rejection' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Your reason is preserved');
  await expect(page.getByRole('textbox', { name: 'Reason for rejection' })).toHaveValue('Review this wording with a specialist.');
  await page.getByRole('button', { name: 'Keep reviewing' }).click();
  await expect(page.getByRole('button', { name: 'Approve draft' })).toBeEnabled();
  await second.close();
});

test('a blocked localStorage property falls back to a usable in-memory sample', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage is disabled', 'SecurityError'); } }));
  await page.reload();
  await expect(page.getByRole('status')).toContainText('this visit only');
  await openTicket(page); await page.getByRole('button', { name: 'Approve draft' }).click();
  await expect(page.locator('.decision-result')).toContainText('Approved');
});

test('simultaneous cross-tab edits serialize and only one old-version mutation wins', async ({ page, context }) => {
  await openTicket(page); await page.getByRole('button', { name: 'Revise draft' }).click();
  await page.getByRole('textbox', { name: 'Reply draft' }).fill('Reply from the first tab.');
  const second = await context.newPage(); await second.goto('./#/tickets/ns-1042');
  await second.getByRole('button', { name: 'Revise draft' }).click();
  await second.getByRole('textbox', { name: 'Reply draft' }).fill('Reply from the second tab.');
  await Promise.all([page.getByRole('button', { name: 'Save changes' }).click(), second.getByRole('button', { name: 'Save changes' }).click()]);
  await expect.poll(async () => {
    return page.evaluate(() => JSON.parse(localStorage.getItem('support-flow.demo.v1')!).tickets.find((ticket: { id: string }) => ticket.id === 'ns-1042').draftVersion);
  }).toBe(2);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('support-flow.demo.v1')!).tickets.find((ticket: { id: string }) => ticket.id === 'ns-1042'));
  expect(saved.events.filter((event: { type: string }) => event.type === 'edit')).toHaveLength(1);
  expect(['Reply from the first tab.', 'Reply from the second tab.']).toContain(saved.draft);
  const alerts = await Promise.all([page.getByRole('alert').count(), second.getByRole('alert').count()]);
  expect(alerts.reduce((sum, value) => sum + value, 0)).toBe(1);
  await second.close();
});
