import { prepareMessage } from './messages.js';
import { ping } from './core.js';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function createHostTools({ getState, getSelected, changed, trace, notify }) {
  const modes = new Map(), drafts = new Map(), opened = new Map();
  const draftFor = host => { if (!drafts.has(host.id)) drafts.set(host.id, { destination: '', subject: '', body: '' }); return drafts.get(host.id); };
  function render(host) {
    const state = getState(), mode = modes.get(host.id) || 'ping', draft = draftFor(host), inbox = (state.messages || []).filter(m => m.to === host.id), sent = (state.messages || []).filter(m => m.from === host.id);
    const targets = state.hosts.filter(h => h.id !== host.id);
    if (!targets.some(h => h.id === draft.destination)) draft.destination = targets[0]?.id || '';
    let content;
    if (mode === 'ping' || mode === 'compose') {
      content = `<form id="host-message-form"><label class="field">Destination PC<select id="host-destination" data-draft="destination">${targets.map(h => `<option value="${h.id}" ${h.id === draft.destination ? 'selected' : ''}>${esc(h.name)} / ${esc(h.ip)}</option>`).join('')}</select></label>${mode === 'compose' ? `<label class="field">Subject<input data-draft="subject" maxlength="80" value="${esc(draft.subject)}"></label><label class="field">Message<textarea data-draft="body" rows="4" maxlength="1000" required>${esc(draft.body)}</textarea></label>` : ''}<button class="primary" type="submit" ${targets.length ? '' : 'disabled'}><i data-lucide="${mode === 'compose' ? 'send' : 'activity'}"></i>${mode === 'compose' ? 'Send email' : 'Send ping'}</button></form>`;
    } else {
      const list = mode === 'inbox' ? inbox : sent;
      const current = list.find(m => m.id === opened.get(host.id));
      content = `<div class="mail-list">${list.length ? [...list].reverse().map(m => `<button class="mail-item ${!m.read && mode === 'inbox' ? 'unread' : ''}" data-open-message="${m.id}"><strong>${esc(m.subject)}</strong><span>${mode === 'inbox' ? 'From ' + esc(m.fromName) : 'To ' + esc(m.toName)}${!m.read && mode === 'inbox' ? ' / New' : ''}</span></button>`).join('') : `<p class="mail-empty">${mode === 'inbox' ? 'No received messages.' : 'No sent messages.'}</p>`}</div>`;
      if (current) content += `<article class="mail-reading"><h4>${esc(current.subject)}</h4><p>From ${esc(current.fromName)} to ${esc(current.toName)}</p><time>${esc(new Date(current.date).toLocaleString('en-CA', { timeZone: 'Etc/GMT+4' }))} (UTC-04:00)</time><div class="mail-body">${esc(current.body)}</div><div class="mail-actions">${mode === 'inbox' ? `<button type="button" data-mail-action="reply" data-message="${current.id}"><i data-lucide="reply"></i>Reply</button>` : ''}<button type="button" title="Delete message from both lab mailboxes" data-mail-action="delete" data-message="${current.id}"><i data-lucide="trash-2"></i></button></div></article>`;
    }
    return `<section class="host-tools"><h4>PC applications</h4><div class="host-tool-tabs" role="group" aria-label="PC application">${[['ping','activity','Ping'],['compose','mail-plus','Email'],['inbox','inbox','Inbox'],['sent','send','Sent']].map(([value, icon, title]) => `<button type="button" data-host-mode="${value}" title="${title}" aria-label="${title}" aria-pressed="${mode === value}"><i data-lucide="${icon}"></i><span>${title}${value === 'inbox' && inbox.some(m => !m.read) ? ' (' + inbox.filter(m => !m.read).length + ')' : ''}</span></button>`).join('')}</div>${content}<details class="mail-scope"><summary>Messaging model</summary><p>Messages are delivered only within this browser's simulated network. Delivery uses the lab's bidirectional reachability check; SMTP, mail servers, DNS, authentication, and TLS are not modeled. In a real network, a successful ping alone does not establish email-service availability.</p></details></section>`;
  }
  const container = document.querySelector('#inspector');
  container.addEventListener('input', event => {
    const key = event.target.dataset.draft; if (!key) return;
    const host = getState().hosts.find(h => h.id === getSelected()); if (host) draftFor(host)[key] = event.target.value;
  });
  container.addEventListener('click', event => {
    const button = event.target.closest('[data-host-mode], [data-open-message], [data-mail-action]'); if (!button) return;
    const state = getState(), host = state.hosts.find(h => h.id === getSelected()); if (!host) return;
    if (button.dataset.hostMode) modes.set(host.id, button.dataset.hostMode);
    if (button.dataset.openMessage) {
      const m = (state.messages || []).find(m => m.id === button.dataset.openMessage && (m.to === host.id || m.from === host.id));
      if (m) { opened.set(host.id, m.id); if (m.to === host.id) m.read = true; }
    }
    if (button.dataset.mailAction) {
      const m = (state.messages || []).find(m => m.id === button.dataset.message && (m.to === host.id || m.from === host.id)); if (!m) return;
      if (button.dataset.mailAction === 'reply') { drafts.set(host.id, { destination: m.from, subject: ('Re: ' + m.subject).slice(0, 80), body: '' }); modes.set(host.id, 'compose'); }
      if (button.dataset.mailAction === 'delete' && confirm('Delete this message from both the sender and destination lab mailboxes?')) state.messages = state.messages.filter(item => item.id !== m.id);
    }
    changed();
  });
  container.addEventListener('submit', event => {
    if (event.target.id !== 'host-message-form') return; event.preventDefault();
    const state = getState(), host = state.hosts.find(h => h.id === getSelected()); if (!host) return;
    const draft = draftFor(host);
    if ((modes.get(host.id) || 'ping') === 'ping') { trace(ping(state, host.id, draft.destination), 'ping', host.id, draft.destination); return; }
    const result = prepareMessage(state, host.id, draft.destination, draft.subject, draft.body);
    if (!result.ok) { notify('Email not delivered: ' + result.error); trace({ ok: false, steps: [{ label: 'Email not delivered: ' + result.error, status: 'fail' }] }, 'email', host.id, draft.destination); return; }
    const m = { ...result.message, id: crypto.randomUUID(), date: new Date().toISOString() };
    (state.messages ||= []).push(m); drafts.set(host.id, { destination: draft.destination, subject: '', body: '' }); modes.set(host.id, 'sent'); opened.set(host.id, m.id); changed();
    trace({ ok: true, path: result.path, steps: [{ label: `${m.fromName} submits a simulated application message.`, status: 'pass' }, { label: 'The lab network path and return path are reachable.', status: 'pass' }, { label: `${m.toName} accepts the message into its simulated inbox. Select that PC and open Inbox to read it.`, status: 'pass' }] }, 'email', host.id, draft.destination);
    notify(`Message delivered to ${m.toName}. Open that PC's inbox.`);
  });
  return { render, reset() { modes.clear(); drafts.clear(); opened.clear(); }, forget(id) { modes.delete(id); drafts.delete(id); opened.delete(id); } };
}
