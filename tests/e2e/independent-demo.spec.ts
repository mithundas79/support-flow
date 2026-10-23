import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'support-flow.demo.v1';
const telemetry = new WeakMap<Page, { errors: string[]; failed: string[]; remote: string[] }>();

test.beforeEach(async ({ page, baseURL }) => {
  const data = { errors: [] as string[], failed: [] as string[], remote: [] as string[] };
  telemetry.set(page, data);
  const appOrigin = new URL(baseURL!).origin;
  page.on('pageerror', error => data.errors.push(error.message));
  page.on('console', entry => { if (entry.type() === 'error') data.errors.push(entry.text()); });
  page.on('requestfailed', request => data.failed.push(`${request.method()} ${request.url()}`));
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== appOrigin) data.remote.push(request.url());
  });
  page.on('response', response => { if (response.status() >= 400) data.failed.push(`${response.status()} ${response.url()}`); });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /Good support starts here/ })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  const data = telemetry.get(page)!;
  expect.soft(data.errors, 'sample must produce no browser JavaScript/console errors').toEqual([]);
  expect.soft(data.failed, 'sample assets and requests must resolve').toEqual([]);
  expect.soft(data.remote, 'sample must make no remote provider or service requests').toEqual([]);
});

test('W01/R01: the base path loads an honest synthetic sample', async ({ page, baseURL }) => {
  expect(new URL(baseURL!).pathname).toBe('/support-flow/');
  await expect(page.getByText('Interactive sample', { exact: false })).toBeVisible();
  await expect(page.getByText('Prepared synthetic examples. No live AI calls.')).toBeVisible();
  await expect(page.getByText('All conversations and drafts are fictional.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Our webhook keeps returning 401/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Can you help us set up SSO/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Refund and billing email change/ })).toBeVisible();
});

test('W02: a revised current version can be approved and survives reload', async ({ page }, testInfo) => {
  await page.getByRole('link', { name: /Our webhook keeps returning 401/ }).click();
  await page.getByRole('button', { name: 'Troubleshoot webhook authentication' }).click();
  await expect(page.getByText('Source: kb-webhook-auth')).toBeVisible();
  await page.getByRole('button', { name: 'Revise draft', exact: true }).click();
  const revision = 'Hi Maya, this is a fictional reviewer revision. Please send the redacted event ID and timestamp.';
  await page.getByRole('textbox', { name: 'Reply draft' }).fill(revision);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('VERSION 2', { exact: true })).toBeVisible();
  await expect(page.getByText(revision, { exact: true })).toBeVisible();
  if (testInfo.project.name === 'desktop') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('review-workspace.png'), fullPage: true });
    await testInfo.attach('actual-review-workspace', { path: testInfo.outputPath('review-workspace.png'), contentType: 'image/png' });
  }
  await page.getByRole('button', { name: 'Approve draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('No email was sent.');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Our webhook keeps returning 401' })).toBeVisible();
  await expect(page.getByText(revision, { exact: true })).toBeVisible();
  await expect(page.getByText('Your sample decision is recorded. No email was sent.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve draft', exact: true })).toHaveCount(0);
});

test('W02/W03: specialist approval is blocked; keyboard rejection records the reason', async ({ page }) => {
  await page.getByRole('link', { name: /Refund and billing email change/ }).click();
  await expect(page.getByRole('button', { name: 'Approve draft', exact: true })).toBeDisabled();
  await expect(page.getByText('A specialist needs to take this one')).toBeVisible();
  const reject = page.getByRole('button', { name: 'Reject draft', exact: true });
  await reject.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Reject this draft' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Reason for rejection' }).fill('Fictional billing specialist must verify the account.');
  await dialog.getByRole('button', { name: 'Confirm rejection', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await page.getByText('Activity timeline', { exact: false }).click();
  await expect(page.getByText(/Draft rejected: Fictional billing specialist must verify the account/)).toBeVisible();
  await page.reload();
  await expect(page.getByText('Your sample decision is recorded. No email was sent.')).toBeVisible();
});

test('W02: filters, empty state and reset remain usable', async ({ page }) => {
  await page.getByRole('button', { name: /^Needs attention/ }).click();
  await expect(page.getByRole('link', { name: /Refund and billing email change/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Our webhook keeps returning 401/ })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search tickets' }).fill('does-not-exist');
  await expect(page.getByRole('heading', { name: 'No tickets found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  await expect(page.getByRole('link', { name: /Our webhook keeps returning 401/ })).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Demo reset.');
  await expect(page.getByRole('textbox', { name: 'Search tickets' })).toHaveValue('');
});

test('W04: malformed persisted storage restores a usable sample', async ({ page }) => {
  await page.evaluate(key => localStorage.setItem(key, '{malformed-json'), STORAGE_KEY);
  await page.reload();
  await expect(page.getByRole('status')).toContainText('original examples were restored');
  await expect(page.getByRole('link', { name: /Our webhook keeps returning 401/ })).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  const count = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).tickets.length, STORAGE_KEY);
  expect(count).toBe(3);
});

test('W02: another tab cannot overwrite a newer draft version', async ({ page, context }) => {
  await page.getByRole('link', { name: /Our webhook keeps returning 401/ }).click();
  await page.getByRole('button', { name: 'Revise draft', exact: true }).click();
  await page.getByRole('textbox', { name: 'Reply draft' }).fill('Unsaved fictional first-tab text.');
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByRole('button', { name: 'Revise draft', exact: true }).click();
  await other.getByRole('textbox', { name: 'Reply draft' }).fill('Newer fictional second-tab revision.');
  await other.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('A newer version is available. Your unsaved text is preserved.')).toBeVisible();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This draft changed in another tab.');
  await expect(page.getByRole('textbox', { name: 'Reply draft' })).toHaveValue('Unsaved fictional first-tab text.');
  await page.getByRole('button', { name: 'Cancel editing', exact: true }).click();
  await expect(page.getByText('Newer fictional second-tab revision.', { exact: true })).toBeVisible();
  await other.close();
});

test('W03: keyboard focus, dialog escape and viewport fit work', async ({ page }) => {
  await page.getByRole('button', { name: 'Take a quick walkthrough', exact: false }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'A thoughtful reply in three steps' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Take a quick walkthrough', exact: false })).toBeFocused();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow, 'inbox should fit the viewport without horizontal scrolling').toBe(false);
  await page.getByRole('link', { name: /Our webhook keeps returning 401/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Our webhook keeps returning 401' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
});
