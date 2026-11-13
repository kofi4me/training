import { ping } from './core.js';
export function prepareMessage(state, sourceId, destinationId, subject, body) {
  if (typeof subject !== 'string' || subject.length > 80 || typeof body !== 'string' || !body.trim() || body.length > 1000) return { ok: false, error: 'Enter a message of 1-1000 characters and a subject of at most 80 characters.' };
  if ((state.messages || []).length >= 20) return { ok: false, error: 'The lab holds 20 messages. Delete a lab message before sending another.' };
  const route = ping(state, sourceId, destinationId);
  if (!route.ok) return { ok: false, error: route.steps.at(-1).label };
  const a = state.hosts.find(h => h.id === sourceId), b = state.hosts.find(h => h.id === destinationId);
  return { ok: true, path: route.path, message: { from: a.id, to: b.id, fromName: a.name, toName: b.name, subject: subject.trim() || 'Lab message', body: body.trim(), read: false } };
}
export function restoreMessages(messages, hosts) {
  if (messages === undefined) return [];
  if (!Array.isArray(messages) || messages.length > 20) throw Error('Invalid lab mailbox.');
  const ids = new Set();
  return messages.map(m => {
    if (!m || typeof m.id !== 'string' || !/^[a-f0-9-]{36}$/.test(m.id) || ids.has(m.id) || !hosts.some(h => h.id === m.from) || !hosts.some(h => h.id === m.to) || m.from === m.to || typeof m.read !== 'boolean' || typeof m.date !== 'string' || !Number.isFinite(Date.parse(m.date)) || ['fromName', 'toName', 'subject', 'body'].some(k => typeof m[k] !== 'string') || m.fromName.length > 64 || m.toName.length > 64 || m.subject.length > 80 || !m.body.trim() || m.body.length > 1000) throw Error('Invalid lab message.');
    ids.add(m.id);
    return { id: m.id, from: m.from, to: m.to, fromName: m.fromName, toName: m.toName, subject: m.subject, body: m.body, read: m.read, date: m.date };
  });
}
