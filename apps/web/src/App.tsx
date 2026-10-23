import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CreateTicketInput, Ticket, TicketStatus } from '@support-flow/contracts';
import { DemoAdapter, HttpAdapter, type SupportAdapter } from './adapters';

const REPO = 'https://github.com/mithundas79/support-flow';
const statusLabels: Record<TicketStatus, string> = { received: 'Received', processing: 'Preparing draft', awaiting_review: 'Ready for review', needs_attention: 'Needs attention', approved: 'Approved', sending: 'Sending', sent: 'Sent', rejected: 'Rejected', failed: 'Needs attention' };
type IconName = 'inbox' | 'arrow' | 'back' | 'search' | 'spark' | 'book' | 'check' | 'close' | 'clock' | 'external' | 'reset' | 'shield' | 'code' | 'plus' | 'chevron' | 'message';
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    inbox: <><path d="M4 4h16v16H4z"/><path d="M4 14h5l2 3h2l2-3h5"/></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>, back: <><path d="M19 12H5m6-6-6 6 6 6"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></>,
    book: <><path d="M12 5v15M3 4c4-1 6 0 9 1 3-1 5-2 9-1v15c-4-1-6 0-9 1-3-1-5-2-9-1Z"/></>,
    check: <path d="m5 12 4 4L19 6"/>, close: <path d="m6 6 12 12M6 18 18 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    external: <><path d="M14 4h6v6m0-6L10 14M10 4H4v16h16v-6"/></>,
    reset: <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></>,
    shield: <><path d="m12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6Z"/><path d="m8 12 3 3 5-6"/></>,
    code: <><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, chevron: <path d="m8 10 4 4 4-4"/>,
    message: <path d="M4 4h16v13H9l-5 4Z"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Brand() { return <span className="brand"><span className="brand-mark"><Icon name="spark" size={26}/></span><span>northstar<span className="brand-sub">SUPPORT WORKSPACE</span></span></span>; }
function Status({ ticket }: { ticket: Ticket }) { return <span className={`status status-${ticket.status}`}><span className="status-dot"/>{statusLabels[ticket.status]}</span>; }
function Avatar({ name, large = false }: { name: string; large?: boolean }) { return <span aria-hidden="true" className={`avatar ${large ? 'avatar-large' : ''} avatar-${name.length % 3}`}>{name.split(' ').map(word => word[0]).slice(0, 2).join('')}</span>; }
function readRoute() { try { return decodeURIComponent(window.location.hash.match(/^#\/tickets\/(.+)$/)?.[1] || ''); } catch { return ''; } }
function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = () => ref.current?.querySelector<HTMLElement>('button, input, textarea, a[href]');
    first()?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, a[href]') || []);
        const firstElement = elements[0]; const lastElement = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === firstElement) { event.preventDefault(); lastElement?.focus(); }
        else if (!event.shiftKey && document.activeElement === lastElement) { event.preventDefault(); firstElement?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); prior?.focus(); };
  }, [onClose]);
  return <div className="dialog-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={ref} role="dialog" aria-modal="true" aria-labelledby="dialog-title" className={`dialog ${wide ? 'dialog-wide' : ''}`}><div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button></div>{children}</div></div>;
}

export function App() {
  const [adapter] = useState<SupportAdapter>(() => import.meta.env.VITE_API_MODE === 'live' ? new HttpAdapter() : new DemoAdapter());
  const demo = adapter.mode === 'demo';
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState(readRoute);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(demo);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<'tour' | 'architecture' | 'create' | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [runtime, setRuntime] = useState<{ providerMode: 'fixture' | 'openai'; deliveryMode: 'mailpit' | 'gmail' } | null>(null);
  const closeModal = useCallback(() => setModal(null), []);
  const refresh = useCallback(async () => {
    try { setTickets(await adapter.list()); if (adapter instanceof DemoAdapter && adapter.notice) setNotice(adapter.notice); if (adapter instanceof HttpAdapter) setRuntime(await adapter.runtime()); }
    catch (cause) { setError(message(cause)); }
    finally { setLoading(false); }
  }, [adapter]);
  useEffect(() => {
    const route = () => { setSelectedId(readRoute()); setError(''); };
    window.addEventListener('hashchange', route);
    return () => window.removeEventListener('hashchange', route);
  }, []);
  useEffect(() => {
    if (demo) { void refresh(); return adapter.subscribe(() => void refresh()); }
    void (adapter as HttpAdapter).session().then(ok => { setAuthenticated(ok); if (ok) void refresh(); }).catch(() => { setAuthenticated(false); setLoading(false); });
    return adapter.subscribe(() => void refresh());
  }, [adapter, demo, refresh]);
  useEffect(() => { if (demo || !authenticated) return; const timer = window.setInterval(() => void refresh(), 5_000); return () => window.clearInterval(timer); }, [demo, authenticated, refresh]);
  useEffect(() => { requestAnimationFrame(() => document.getElementById('page-title')?.focus({ preventScroll: true })); }, [selectedId]);
  const navigate = (id = '') => { window.location.hash = id ? `/tickets/${encodeURIComponent(id)}` : '/'; setSelectedId(id); setError(''); };
  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await refresh(); setNotice(success); return true; }
    catch (cause) { setError(message(cause)); await refresh(); return false; }
    finally { setBusy(false); }
  }
  const ticket = tickets.find(item => item.id === selectedId);
  const counts = { review: tickets.filter(item => item.status === 'awaiting_review').length, attention: tickets.filter(item => ['needs_attention', 'failed'].includes(item.status)).length, completed: tickets.filter(item => ['approved', 'sent', 'rejected'].includes(item.status)).length };
  const visible = useMemo(() => tickets.filter(item => {
    const query = search.toLowerCase().trim();
    const matches = `${item.subject} ${item.customerName} ${item.customerEmail} ${item.id}`.toLowerCase().includes(query);
    return matches && (filter === 'all' || filter === 'review' && item.status === 'awaiting_review' || filter === 'attention' && ['needs_attention', 'failed'].includes(item.status) || filter === 'completed' && ['approved', 'sent', 'rejected'].includes(item.status));
  }), [tickets, search, filter]);
  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to main content</a>
    <aside className="sidebar"><a href="#/" className="brand-link" onClick={() => navigate()} aria-label="Northstar inbox"><Brand/></a><div className="workspace-label">YOUR WORKSPACE</div><nav aria-label="Main navigation"><a href="#/" className="nav-item active" onClick={() => navigate()}><Icon name="inbox"/><span>Inbox</span><span className="nav-count">{counts.review + counts.attention}</span></a><button className="nav-item" onClick={() => setModal('architecture')}><Icon name="book"/><span>How it works</span><Icon name="external" size={14}/></button></nav><div className="sidebar-bottom"><div className="reviewer-avatar">JD</div><div><strong>Jamie Davis</strong><span>{demo ? 'Sample reviewer' : 'Local reviewer'}</span></div><span className="online-dot"/></div></aside>
    <div className="app-body"><header className="topbar"><div className="workspace-crumb">Workspace <span>/</span> <strong>Support inbox</strong></div><div className="topbar-actions"><span className={`mode-badge ${demo ? '' : 'mode-live'}`}><span/>{demo ? 'Interactive sample · no emails sent' : runtime ? runtime.providerMode === 'fixture' ? 'Local API · fixture provider' : 'Local API · OpenAI configured' : 'Local workspace'}</span><a className="repo-link" href={`${REPO}#run-the-boilerplate`} target="_blank" rel="noreferrer">Run locally <Icon name="external" size={14}/></a></div></header>
    <main id="main-content" className={selectedId ? 'main-content detail-main' : 'main-content'} tabIndex={-1}>
      {error && <div className="feedback feedback-error" role="alert"><Icon name="shield"/><span>{error}</span><button aria-label="Dismiss error" className="icon-button" onClick={() => setError('')}><Icon name="close" size={16}/></button></div>}
      {notice && <div className="feedback feedback-info" role="status"><Icon name="check"/><span>{notice}</span><button aria-label="Dismiss notification" className="icon-button" onClick={() => setNotice('')}><Icon name="close" size={16}/></button></div>}
      {!authenticated ? <Login busy={busy} onLogin={async token => { const ok = await perform(() => (adapter as HttpAdapter).login(token), 'You are signed in to your local workspace.'); if (ok) { setAuthenticated(true); await refresh(); } }}/>
      : loading ? <div className="loading-state" role="status"><span className="loader"/>Loading your inbox…</div>
      : selectedId ? ticket ? <TicketWorkspace key={ticket.id} ticket={ticket} demo={demo} busy={busy} onBack={() => navigate()} onEdit={(draft, version) => perform(() => adapter.edit(ticket.id, draft, version), 'Draft saved. Review the updated version before approving.')} onApprove={version => perform(() => adapter.approve(ticket.id, version), demo ? 'Approval recorded in this sample. No email was sent.' : 'Draft approved. Check the timeline for delivery progress.')} onReject={(version, reason) => perform(() => adapter.reject(ticket.id, version, reason), 'Draft rejected. The reason is recorded in the timeline.')}/>
      : <div className="empty-state"><Icon name="inbox" size={34}/><h1 id="page-title" tabIndex={-1}>Ticket not found</h1><p>This ticket may have been removed or the demo was reset.</p><button className="button button-primary" onClick={() => navigate()}>Return to inbox</button></div>
      : <>
        <div className="page-heading"><div><div className="eyebrow">A LITTLE HELP. A HUMAN TOUCH.</div><h1 id="page-title" tabIndex={-1}>Good support starts here<span>.</span></h1><p>Thoughtful drafts. Trusted context. You make the final call.</p></div><button className="button button-primary" onClick={() => setModal('create')}><Icon name="plus" size={16}/>{demo ? 'Add sample email' : 'New ticket'}</button></div>
        {demo && <section className="welcome-card" aria-label="Explore the sample"><div className="welcome-copy"><span className="pill"><Icon name="spark" size={13}/> THE HUMAN-IN-THE-LOOP INBOX</span><h2>A first draft.<br/>Never the last word.</h2><p>Explore three fictional customer conversations.<br className="desktop-break"/> Check the context, shape the reply, and decide what happens next.</p><button className="button button-white" onClick={() => setModal('tour')}>Take a quick walkthrough <Icon name="arrow" size={16}/></button><span className="sample-note">Prepared synthetic examples. No live AI calls.</span></div><div className="workflow-art" aria-hidden="true"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-message"><div className="art-mini-avatar">M</div><div><span>Customer email</span><strong>A little help, please.</strong></div><span className="art-tick">↗</span></div><div className="art-connector"/><div className="art-draft"><span className="art-spark"><Icon name="spark" size={19}/></span><div><strong>A considered response</strong><span>Grounded in your knowledge</span></div><div className="art-lines"><i/><i/><i/></div><div className="art-review"><span className="art-small-check"><Icon name="check" size={12}/></span>Human review comes first<span className="art-cursor">↖</span></div></div><span className="art-caption"><Icon name="shield" size={13}/> YOU STAY IN CONTROL</span></div></section>}
        <section className="inbox-section" aria-labelledby="inbox-title"><div className="section-heading"><div><h2 id="inbox-title">Your inbox <span>{tickets.length}</span></h2><p>{demo ? 'Three ways to put thoughtful support into practice.' : 'Review customer requests and grounded reply drafts.'}</p></div><div className="inbox-tools">{demo ? <button className="text-button" onClick={() => void perform(async () => { await (adapter as DemoAdapter).reset(); setSearch(''); setFilter('all'); }, 'Demo reset. The original examples are ready to explore.')} disabled={busy}><Icon name="reset" size={15}/>Reset demo</button> : <button className="text-button" onClick={() => void refresh()} disabled={busy}><Icon name="reset" size={15}/>Refresh</button>}</div></div>
        <div className="inbox-card"><div className="inbox-toolbar"><div className="filter-tabs" role="group" aria-label="Filter tickets">{[['all', 'All tickets', tickets.length], ['review', 'Ready for review', counts.review], ['attention', 'Needs attention', counts.attention], ['completed', 'Completed', counts.completed]].map(([value, label, count]) => <button key={value} className={filter === value ? 'filter active' : 'filter'} aria-pressed={filter === value} onClick={() => setFilter(String(value))}>{label}<span>{count}</span></button>)}</div><label className="search-box"><Icon name="search" size={16}/><input aria-label="Search tickets" placeholder="Search tickets…" value={search} onChange={event => setSearch(event.target.value)}/>{search && <button aria-label="Clear search" onClick={() => setSearch('')}><Icon name="close" size={14}/></button>}</label></div>
        <div className="table-labels" aria-hidden="true"><span>CUSTOMER & CONVERSATION</span><span>CATEGORY</span><span>STATUS</span><span/></div><div className="ticket-list">{visible.length ? visible.map(item => <a className="ticket-row" key={item.id} href={`#/tickets/${item.id}`} onClick={() => navigate(item.id)}><div className="ticket-conversation"><Avatar name={item.customerName}/><div><div className="ticket-name">{item.customerName}<span>{item.id.replace('ns-', '#')}</span></div><h3>{item.subject}</h3><p>{item.summary}</p></div></div><span className="category">{item.category}</span><div className="ticket-status"><Status ticket={item}/>{item.priority === 'high' && <span className="priority-high">High priority</span>}</div><Icon name="arrow" size={18}/></a>) : <div className="empty-state"><Icon name="search" size={30}/><h3>No tickets found</h3><p>Try another search or choose a different filter.</p><button className="text-button" onClick={() => { setSearch(''); setFilter('all'); }}>Clear search and filters</button></div>}</div><div className="inbox-footer"><span><span className="small-dot"/>{demo ? 'All conversations and drafts are fictional.' : 'Every approved reply is tied to its draft version.'}</span><span>{visible.length} of {tickets.length} tickets</span></div></div></section>
        <div className="principles"><div><span className="principle-icon"><Icon name="book"/></span><div><strong>Context before confidence</strong><p>Inspect the source behind each reply.</p></div></div><div><span className="principle-icon"><Icon name="shield"/></span><div><strong>A person makes the call</strong><p>Approve, revise, or ask for a specialist.</p></div></div><a href={`${REPO}#run-the-boilerplate`} target="_blank" rel="noreferrer"><span className="principle-icon"><Icon name="code"/></span><div><strong>Make it your workflow <Icon name="external" size={12}/></strong><p>Explore the open-source boilerplate.</p></div></a></div>
      </>}
      <footer className="page-footer"><span>Northstar is a fictional SaaS company.</span><a href={REPO} target="_blank" rel="noreferrer">Built with Support Flow <Icon name="external" size={12}/></a>{!demo && authenticated && <button className="text-button" onClick={async () => { if (await perform(() => (adapter as HttpAdapter).logout(), 'Signed out.')) { setAuthenticated(false); setTickets([]); } }}>Sign out</button>}</footer>
    </main></div>
    {modal === 'tour' && <Dialog title="A thoughtful reply in three steps" onClose={closeModal}><p className="dialog-intro">This is an interactive sample. The emails, article matches, and drafts were prepared in advance. Nothing is sent.</p><ol className="tour-steps"><li><span>01</span><div><h3>Read the conversation</h3><p>Start with Maya’s webhook question and the triage summary.</p></div></li><li><span>02</span><div><h3>Check the source</h3><p>Open the knowledge excerpt. Decide whether the reply is grounded and useful.</p></div></li><li><span>03</span><div><h3>Make the final call</h3><p>Revise the draft, approve the current version, or reject it with a reason.</p></div></li></ol><button className="button button-primary full-width" onClick={() => { closeModal(); navigate('ns-1042'); }}>Open the guided ticket <Icon name="arrow" size={16}/></button><p className="dialog-footnote">Also explore the SSO clarification and sensitive billing escalation.</p></Dialog>}
    {modal === 'architecture' && <Dialog title="Built around human judgment" onClose={closeModal} wide><p className="dialog-intro">Support Flow pairs grounded drafts with version-bound human review. The public sample runs entirely in your browser.</p><div className="architecture-grid"><div><Icon name="inbox"/><h3>1. Understand</h3><p>The local n8n workflow classifies a customer email and retrieves fictional knowledge-base passages from PostgreSQL.</p></div><div><Icon name="spark"/><h3>2. Prepare</h3><p>The configured server workflow requests a structured OpenAI draft and validates its source references. Unknown or sensitive cases need attention.</p></div><div><Icon name="shield"/><h3>3. Review</h3><p>A reviewer checks context and approves a specific draft version. The local stack uses Mailpit as its default email sink.</p></div></div><div className="info-box"><strong>What you see here</strong><p>Prepared synthetic scenarios with local browser storage. Approval records a sample decision; it does not call OpenAI, n8n, or an email provider.</p></div><a className="button button-primary full-width" href={`${REPO}#run-the-boilerplate`} target="_blank" rel="noreferrer">Run the real local workflow <Icon name="external" size={16}/></a></Dialog>}
    {modal === 'create' && <CreateDialog demo={demo} busy={busy} onClose={closeModal} onCreate={async input => { let created: Ticket | undefined; const ok = await perform(async () => { created = await adapter.create(input); }, demo ? 'Custom sample added. No provider was called.' : 'Ticket received. Watch its status for workflow progress.'); if (ok && created) { closeModal(); navigate(created.id); } }}/>}
  </div>;
}

function message(cause: unknown) { return cause instanceof Error ? cause.message : 'Something went wrong. Please try again.'; }

export function TicketWorkspace({ ticket, demo, busy, onBack, onEdit, onApprove, onReject }: { ticket: Ticket; demo: boolean; busy: boolean; onBack: () => void; onEdit: (draft: string, version: number) => Promise<boolean>; onApprove: (version: number) => Promise<boolean>; onReject: (version: number, reason: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState<{ text: string; version: number } | null>(null);
  const [sourceOpen, setSourceOpen] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [rejectVersion, setRejectVersion] = useState(ticket.draftVersion);
  const [rejectError, setRejectError] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const closeReject = useCallback(() => setRejectOpen(false), []);
  const reviewable = ['awaiting_review', 'needs_attention'].includes(ticket.status);
  const canApprove = ticket.status === 'awaiting_review' && ticket.sources.length > 0 && Boolean(ticket.draft.trim());
  useEffect(() => { if (editing) editorRef.current?.focus(); }, [Boolean(editing)]);
  return <>
    <button className="back-link" onClick={onBack}><Icon name="back" size={16}/>Back to inbox</button>
    <div className="detail-heading"><div><div className="detail-meta"><span>{ticket.id.replace('ns-', '#')}</span><span className="category">{ticket.category}</span>{ticket.priority === 'high' && <span className="priority-high">High priority</span>}</div><h1 id="page-title" tabIndex={-1}>{ticket.subject}</h1><div className="detail-customer"><Avatar name={ticket.customerName}/><strong>{ticket.customerName}</strong><span>{ticket.customerEmail}</span></div></div><Status ticket={ticket}/></div>
    {demo && <div className="sample-strip"><Icon name="spark" size={14}/><span>Prepared synthetic example. Your decisions stay in this browser. No email is sent.</span></div>}
    <div className="ticket-workspace"><div className="context-column"><section className="panel original-panel"><div className="panel-heading"><h2><Icon name="message"/>Original message</h2><span className="subtle-label">EMAIL</span></div><div className="email-header"><Avatar name={ticket.customerName} large/><div><strong>{ticket.customerName}</strong><span>To: Northstar Support</span></div><span className="email-time">{new Date(ticket.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span></div><div className="email-body">{ticket.body}</div></section>
    <section className="panel context-panel"><div className="panel-heading"><h2><Icon name="spark"/>Review context</h2><span className="subtle-label">{demo ? 'PREPARED' : 'WORKFLOW'}</span></div><p className="summary">{ticket.summary || 'The workflow has not published a summary yet.'}</p><div className="context-divider"/><div className="source-heading"><Icon name="book"/><strong>Knowledge sources</strong><span>{ticket.sources.length}</span></div>{ticket.sources.length ? ticket.sources.map(source => <div className="source-card" key={source.id}><button className="source-toggle" onClick={() => setSourceOpen(sourceOpen === source.id ? null : source.id)} aria-expanded={sourceOpen === source.id} aria-controls={`source-${source.id}`}><span className="document-icon"><Icon name="book" size={17}/></span><span><strong>{source.title}</strong><small>Inspect the supporting excerpt</small></span><span className={sourceOpen === source.id ? 'chevron-open' : ''}><Icon name="chevron" size={16}/></span></button>{sourceOpen === source.id && <div id={`source-${source.id}`} className="source-excerpt"><p>{source.excerpt}</p>{source.url?.startsWith('https://') && <a href={source.url} target="_blank" rel="noreferrer">Read article <Icon name="external" size={12}/></a>}<span>Source: {source.id}</span></div>}</div>) : <div className="no-sources"><Icon name="shield" size={18}/><p>No verified source supports a routine reply. A human specialist must review this request.</p></div>}</section>
    <section className="panel timeline-panel"><details><summary><span><Icon name="clock"/>Activity timeline <small>{ticket.events.length}</small></span><Icon name="chevron" size={16}/></summary><ol className="timeline">{ticket.events.map(event => <li key={event.id}><span className="timeline-dot"/><div><p>{event.message}</p><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC</time></div></li>)}</ol></details></section></div>
    <section className="panel draft-panel" aria-labelledby="draft-title"><div className="panel-heading"><h2 id="draft-title"><span className="draft-icon"><Icon name="spark" size={17}/></span>Suggested reply</h2><span className="version-label">VERSION {ticket.draftVersion}</span></div><div className="draft-toolbar"><span><span className="small-dot"/>{demo ? 'Prepared sample draft' : 'Workflow draft'}</span><span>To: {ticket.customerName.split(' ')[0]}</span></div>{ticket.status === 'needs_attention' && <div className="attention-box"><Icon name="shield" size={18}/><div><strong>A specialist needs to take this one</strong><p>Review the context and reject the routine draft to record the handoff. Approval is blocked.</p></div></div>}{editing ? <div className="draft-editor-wrap"><label className="sr-only" htmlFor="reply-draft">Reply draft</label><textarea ref={editorRef} id="reply-draft" className="draft-editor" maxLength={10000} value={editing.text} onChange={event => setEditing({ ...editing, text: event.target.value })}/><span className="character-count">{editing.text.length.toLocaleString()} / 10,000</span>{editing.version !== ticket.draftVersion && <p className="inline-warning" role="status">A newer version is available. Your unsaved text is preserved.</p>}</div> : <div className="draft-content">{ticket.draft || <span className="muted">{reviewable ? 'No draft has been published. You can add a draft for manual review.' : 'The workflow has not published a draft yet.'}</span>}</div>}
    <div className="review-footer">{reviewable ? <>{editing ? <><div className="review-note"><Icon name="shield" size={15}/>Saving creates a new version for review.</div><div className="review-actions"><button className="button button-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel editing</button><button className="button button-primary" disabled={busy || !editing.text.trim()} onClick={async () => { if (await onEdit(editing.text, editing.version)) setEditing(null); }}>{busy ? 'Saving…' : 'Save changes'}<Icon name="check" size={16}/></button></div></> : <><div className="review-note"><Icon name="shield" size={15}/>{demo ? 'You decide. This sample never sends email.' : 'Approval applies only to this draft version.'}</div><div className="review-actions"><button className="button button-secondary revise-button" onClick={() => setEditing({ text: ticket.draft, version: ticket.draftVersion })} disabled={busy}>Revise draft</button><button className="button button-reject" onClick={() => { setReason(''); setRejectError(''); setRejectVersion(ticket.draftVersion); setRejectOpen(true); }} disabled={busy}>Reject draft</button><button className="button button-primary approve-button" disabled={busy || !canApprove} onClick={() => void onApprove(ticket.draftVersion)}><Icon name="check" size={17}/>{busy ? 'Working…' : 'Approve draft'}</button></div>{!canApprove && <p className="approval-blocked">Routine approval requires a grounded draft that is ready for review.</p>}</>}</> : <ReviewOutcome ticket={ticket} demo={demo}/>}</div></section></div>
    {rejectOpen && <Dialog title="Reject this draft" onClose={closeReject}><p className="dialog-intro">Record what needs a human follow-up. Rejecting a draft prevents routine approval.</p><div role={rejectError ? 'alert' : undefined} className={rejectError ? 'feedback feedback-error' : undefined}>{rejectError}</div><form onSubmit={async event => { event.preventDefault(); if (await onReject(rejectVersion, reason)) closeReject(); else setRejectError('The action could not be completed. Your reason is preserved. Close this dialog to review the latest draft version before trying again.'); }}><label className="form-label" htmlFor="reject-reason">Reason for rejection</label><textarea id="reject-reason" className="form-input" rows={4} maxLength={2000} required value={reason} onChange={event => setReason(event.target.value)} placeholder="For example: Billing specialist needs to verify the account."/><div className="dialog-actions"><button className="button button-secondary" type="button" onClick={closeReject}>Keep reviewing</button><button className="button button-danger" type="submit" disabled={busy || !reason.trim()}>{busy ? 'Rejecting…' : 'Confirm rejection'}</button></div></form></Dialog>}
  </>;
}

function ReviewOutcome({ ticket, demo }: { ticket: Ticket; demo: boolean }) {
  const pending = ['received', 'processing', 'sending'].includes(ticket.status);
  const failed = ticket.status === 'failed';
  const rejected = ticket.status === 'rejected';
  const description = demo ? 'Your sample decision is recorded. No email was sent.'
    : ticket.status === 'received' || ticket.status === 'processing' ? 'Waiting for the configured workflow to publish its assessment. This view refreshes automatically.'
    : ticket.status === 'approved' ? 'This version is approved. Check the activity timeline for dispatch and delivery progress.'
    : ticket.status === 'sending' ? 'Dispatch is in progress. Check the timeline before taking any recovery action.'
    : failed ? 'The workflow could not complete this request. Inspect the activity timeline and follow the documented recovery steps.'
    : 'This draft is no longer available for routine review. Check the activity timeline for its current state.';
  return <div className={`decision-result ${rejected ? 'decision-rejected' : pending ? 'decision-pending' : failed ? 'decision-failed' : ''}`}><span className="decision-check"><Icon name={pending ? 'clock' : failed ? 'shield' : rejected ? 'close' : 'check'} size={20}/></span><div><strong>{statusLabels[ticket.status]}</strong><p>{description}</p></div></div>;
}

function Login({ busy, onLogin }: { busy: boolean; onLogin: (token: string) => Promise<void> }) {
  const [token, setToken] = useState('');
  return <section className="login-card panel"><span className="login-icon"><Icon name="shield" size={28}/></span><div className="eyebrow">LOCAL SUPPORT WORKSPACE</div><h1 id="page-title" tabIndex={-1}>Welcome back.</h1><p>Sign in with the reviewer token from your local server configuration.</p><form onSubmit={async event => { event.preventDefault(); const value = token; setToken(''); await onLogin(value); }}><label className="form-label" htmlFor="reviewer-token">Reviewer token</label><input autoComplete="off" spellCheck={false} className="form-input" type="password" id="reviewer-token" required value={token} onChange={event => setToken(event.target.value)}/><button className="button button-primary full-width" type="submit" disabled={busy || !token}>{busy ? 'Signing in…' : 'Sign in'}<Icon name="arrow" size={16}/></button></form><small>The token is used to establish a session and is never saved in browser storage.</small></section>;
}

function CreateDialog({ demo, busy, onClose, onCreate }: { demo: boolean; busy: boolean; onClose: () => void; onCreate: (input: CreateTicketInput) => Promise<void> }) {
  return <Dialog title={demo ? 'Add a sample email' : 'Create a support ticket'} onClose={onClose}><p className="dialog-intro">{demo ? 'Use fictional details. Custom samples are marked for human attention because no AI or retrieval runs in this demo.' : 'Add a customer email to the configured local workflow.'}</p><form onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); await onCreate({ externalId: `manual-${crypto.randomUUID()}`, customerName: String(form.get('name')), customerEmail: String(form.get('email')), subject: String(form.get('subject')), body: String(form.get('body')) }); }}><div className="form-grid"><label className="form-label">Customer name<input className="form-input" name="name" required maxLength={200} placeholder="Alex Rivera"/></label><label className="form-label">Customer email<input className="form-input" type="email" name="email" required maxLength={320} placeholder="alex@studio.example"/></label></div><label className="form-label">Subject<input className="form-input" name="subject" required maxLength={300} placeholder="What can we help with?"/></label><label className="form-label">Original message<textarea className="form-input" name="body" required rows={5} maxLength={50000} placeholder="Write the customer’s message…"/></label><div className="dialog-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy} type="submit">{busy ? 'Adding…' : demo ? 'Add sample' : 'Create ticket'}<Icon name="arrow" size={16}/></button></div></form></Dialog>;
}
