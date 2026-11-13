export const gatewayMAC = '02:00:00:00:00:01';
export const attackerMAC = '02:00:00:00:00:66';
export function initialMitm() { return { poisoned: false, binding: false, protocol: 'https', forwarding: true, tamper: false }; }
export function poisonCache(state) { return state.binding ? { ...state, poisoned: false } : { ...state, poisoned: true }; }
export function inspectSession(state, message) {
  const intercepted = state.poisoned;
  const delivered = !intercepted || state.forwarding;
  const readable = intercepted && state.protocol === 'http';
  return { intercepted, delivered, readable, changed: readable && delivered && state.tamper,
    gatewayMAC: intercepted ? attackerMAC : gatewayMAC,
    observer: !intercepted ? 'No traffic traverses the observer.' : readable ? message : 'Encrypted application data; message content is not exposed.',
    recipient: !delivered ? null : readable && state.tamper ? '[Modified by simulated intermediary] ' + message : message,
    path: intercepted ? ['client', 'observer', ...(delivered ? ['gateway', 'service'] : [])] : ['client', 'gateway', 'service'] };
}
export function initialLoad() { return { tick: 0, qLegit: 0, qAttack: 0, arrivals: 0, processed: 0, losses: 0, history: [] }; }
export function loadStep(previous, config) {
  const { legitimate, sources, rate, capacity, link, limit, attack, limiting } = config;
  if ([legitimate, sources, rate, capacity, link, limit].some(n => !Number.isFinite(n) || n < 0) || capacity < 1 || link < 1 || sources > 100 || rate > 100 || legitimate > 200 || capacity > 300 || link > 2000 || limit > 100) throw Error('Invalid load-model settings.');
  const generatedAttack = attack ? sources * rate : 0;
  const total = legitimate + generatedAttack;
  const upstreamFraction = total ? Math.min(1, link / total) : 1;
  const upstreamL = legitimate * upstreamFraction, upstreamA = generatedAttack * upstreamFraction;
  const admittedL = limiting ? Math.min(upstreamL, 20 * limit) : upstreamL;
  const admittedA = limiting ? Math.min(upstreamA, sources * limit) : upstreamA;
  // Uniform arrivals and service share each 10 ms interval; the buffer stores only waiting work.
  let qLegit = previous.qLegit, qAttack = previous.qAttack, servedL = 0, servedA = 0, bufferLostL = 0;
  for (let i = 0; i < 100; i++) {
    qLegit += admittedL / 100; qAttack += admittedA / 100;
    const totalQueued = qLegit + qAttack;
    const fraction = totalQueued ? Math.min(1, capacity / 100 / totalQueued) : 0;
    const doneL = qLegit * fraction, doneA = qAttack * fraction;
    servedL += doneL; servedA += doneA; qLegit -= doneL; qAttack -= doneA;
    const waiting = qLegit + qAttack;
    if (waiting > 200) {
      const overflow = (waiting - 200) / waiting;
      bufferLostL += qLegit * overflow;
      qLegit *= 1 - overflow; qAttack *= 1 - overflow;
    }
  }
  const clean = n => Math.round(Math.max(0, n) * 1e10) / 1e10;
  servedL = clean(servedL); servedA = clean(servedA); qLegit = clean(qLegit); qAttack = clean(qAttack); bufferLostL = clean(bufferLostL);
  if (qLegit + qAttack > 200) qAttack = Math.max(0, 200 - qLegit);
  const upstreamLostL = clean(legitimate - upstreamL), limiterLostL = clean(upstreamL - admittedL);
  const lostL = clean(upstreamLostL + limiterLostL + bufferLostL);
  const row = { tick: previous.tick + 1, incoming: total, servedL, servedA, lostL, filtered: upstreamL + upstreamA - admittedL - admittedA, upstreamLostL, limiterLostL, bufferLostL, queue: qLegit + qAttack, capacity, settings: { ...config } };
  return { tick: row.tick, qLegit, qAttack,
    arrivals: previous.arrivals + legitimate, processed: previous.processed + servedL, losses: previous.losses + lostL,
    history: [...previous.history, row].slice(-60) };
}
