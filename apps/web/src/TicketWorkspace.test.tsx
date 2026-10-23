import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TicketWorkspace } from './App';
import { initialTickets } from './demo-data';
import type { Ticket } from '@support-flow/contracts';

function render(ticket: Ticket, demo = true) {
  return renderToStaticMarkup(<TicketWorkspace ticket={ticket} demo={demo} busy={false} onBack={vi.fn()} onEdit={vi.fn()} onApprove={vi.fn()} onReject={vi.fn()}/>);
}
describe('review workspace component', () => {
  it('presents original content, version, inspectable sources and explicit sample disclosure', () => {
    const html = render(initialTickets()[0]);
    expect(html).toContain('Original message');
    expect(html).toContain('We rotated our API key this morning');
    expect(html).toContain('VERSION 1');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Troubleshoot webhook authentication');
    expect(html).toContain('Prepared synthetic example.');
    expect(html).toContain('No email is sent.');
    expect(html).not.toContain('https://docs.');
  });
  it('renders sensitive requests with an explicitly disabled ordinary approval', () => {
    const html = render(initialTickets()[2]);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Approve draft<\/button>/);
    expect(html).toContain('A specialist needs to take this one');
    expect(html).toContain('No verified source supports a routine reply');
    expect(html).toContain('Reject draft');
  });
  it('shows a recorded decision and removes actions for completed tickets', () => {
    const html = render({ ...initialTickets()[0], status: 'approved' });
    expect(html).toContain('Your sample decision is recorded. No email was sent.');
    expect(html).not.toContain('Approve draft');
    expect(html).not.toContain('Revise draft');
    expect(html).not.toContain('Reject draft');
  });
  it('escapes customer content and avoids sample claims for the real API workspace', () => {
    const html = render({ ...initialTickets()[0], body: '<script>window.untrusted=true</script>' }, false);
    expect(html).toContain('&lt;script&gt;window.untrusted=true&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('Prepared synthetic example.');
    expect(html).toContain('Approval applies only to this draft version.');
  });
  it('shows honest pending and failed states while the real workflow runs', () => {
    const pending = render({ ...initialTickets()[0], status: 'processing', draft: '', sources: [] }, false);
    expect(pending).toContain('Waiting for the configured workflow');
    expect(pending).not.toContain('Your sample decision');
    expect(pending).not.toContain('Approve draft');
    const failed = render({ ...initialTickets()[0], status: 'failed' }, false);
    expect(failed).toContain('documented recovery steps');
    expect(failed).not.toContain('This version is approved');
  });
});
