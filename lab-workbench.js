import { mountReplay } from './replay.js';

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const list = (tag, items) => '<' + tag + '>' + items.map(item => '<li>' + esc(item) + '</li>').join('') + '</' + tag + '>';
const field = f => typeof f.value === 'boolean'
  ? '<label class="toggle-row"><input name="' + f.key + '" type="checkbox"' + (f.value ? ' checked' : '') + '>' + esc(f.label) + '</label>'
  : '<label class="field">' + esc(f.label) + (f.options
    ? '<select name="' + f.key + '">' + f.options.map(([value, label]) => '<option value="' + esc(value) + '"' + (String(f.value) === String(value) ? ' selected' : '') + '>' + esc(label) + '</option>').join('') + '</select>'
    : '<input name="' + f.key + '" value="' + esc(f.value) + '" maxlength="' + (f.maxLength || 48) + '"' + (f.numeric ? ' inputmode="numeric"' : '') + '>') + '</label>';
const evidenceList = rows => '<dl class="repair-evidence">' + rows.map(([label, value]) => '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>').join('') + '</dl>';

export function mountLabWorkbench(parent, definition, { settings: saved, onSettings, onVerify } = {}) {
  const { id, title, level, brief, background, tasks, reflection, boundary, reference, fields, nodes, nodeIcons, run } = definition;
  const host = document.createElement('section');
  host.id = id;
  host.className = 'module-lab course-workbench';
  host.innerHTML = `<p class="eyebrow">${esc(level)} / Applied lab</p><h3>${esc(title)}</h3><p>${esc(brief)}</p>
    <details class="lab-checkpoint" open><summary>Method and verification</summary><p>${esc(background)}</p>${list('ol', tasks)}
    <p><strong>Explain your evidence:</strong> ${esc(reflection)}</p></details>
    <div class="device-line${nodeIcons ? ' workbench-icon-path' : ''}" data-workbench-path>${nodes.map(([asset, label], i) => '<figure data-workbench-node="' + i + '">' + (nodeIcons
      ? '<i data-lucide="' + esc(asset) + '" aria-hidden="true"></i>' : '<img src="assets/devices/' + asset + '.webp" alt="">') + '<figcaption>' + esc(label) + '</figcaption></figure>').join('<span aria-hidden="true">&#8594;</span>')}</div>
    <div class="lab-controls" data-workbench-config>${fields.map(field).join('')}</div>
    <div class="lab-controls"><button type="button" data-play>Play trace</button><button type="button" data-next>Next step</button><button type="button" data-reset>Restart trace</button>
    <button type="button" data-restore title="Restore starting settings" aria-label="Restore starting settings"><i data-lucide="rotate-ccw" aria-hidden="true"></i></button>
    <button type="button" data-baseline disabled>Save result as baseline</button></div>
    <p class="module-result ip-step-status" role="status"></p>
    <div class="linux-terminal" data-workbench-terminal hidden><p class="linux-terminal-label">Simulated terminal</p><pre><code data-workbench-command></code></pre><pre data-workbench-output></pre></div>
    <div data-workbench-results></div>
    <details class="lab-checkpoint"><summary>Model scope and reference</summary><p>${esc(boundary || 'Deterministic browser simulation.')}</p>
    <p>Results are for guided practice and do not award course credit.</p>
    <p><a href="${esc(reference[1])}">${esc(reference[0])}</a></p></details>`;
  parent.append(host);
  const controls = host.querySelector('[data-workbench-config]');
  const resultBox = host.querySelector('[data-workbench-results]');
  const terminal = host.querySelector('[data-workbench-terminal]');
  const saveBaseline = host.querySelector('[data-baseline]');
  const inputs = new Map(fields.map(f => [f.key, controls.querySelector('[name="' + f.key + '"]')]));
  function applySettings(settings) {
    for (const f of fields) {
      const input = inputs.get(f.key);
      const value = settings?.[f.key];
      if (input.type === 'checkbox') input.checked = typeof value === 'boolean' ? value : f.value;
      else if (typeof value === 'string' && (f.options ? f.options.some(([id]) => id === value) : value.length <= (f.maxLength || 48))) input.value = value;
      else input.value = f.value;
    }
  }
  const readSettings = () => Object.fromEntries([...inputs].map(([key, input]) => [key, input.type === 'checkbox' ? input.checked : input.value]));
  if (saved) applySettings(saved);
  let result, baseline, finished = false;
  function renderResults() {
    const all = result.passed ?? result.checks.every(c => c.ok);
    const prior = new Map((baseline || []).map(c => [c.label, c]));
    resultBox.innerHTML = '<h4>' + (all ? 'Verification passed' : 'Verification incomplete') + '</h4>' + evidenceList(result.checks.map(c => {
      const before = prior.get(c.label);
      const comparison = !before ? '' : before.ok === c.ok && before.detail === c.detail
        ? ' Baseline: unchanged.' : ' Baseline: ' + (before.ok ? 'pass. ' : 'needs attention. ') + before.detail;
      return [c.label, (c.ok ? 'Pass. ' : 'Needs attention. ') + c.detail + comparison];
    })) + (result.facts?.length ? '<h4>Observed state</h4>' + evidenceList(result.facts) : '');
  }
  const replay = mountReplay(host, {
    build() {
      result = null;
      result = run(readSettings());
      return result.events;
    },
    onFrame(index, events) {
      const current = events[index];
      host.querySelectorAll('[data-workbench-node]').forEach(node => node.classList.toggle('active', !!current && Number(node.dataset.workbenchNode) === current.node));
      terminal.hidden = !current?.command;
      if (!terminal.hidden) {
        terminal.querySelector('[data-workbench-command]').textContent = '$ ' + current.command;
        terminal.querySelector('[data-workbench-output]').textContent = current.output || '[no output]';
      }
      const wasFinished = finished;
      finished = !!result && events.length > 0 && index === events.length - 1;
      saveBaseline.disabled = !finished;
      if (finished) {
        renderResults();
        if (!wasFinished) onVerify?.(readSettings(), result);
      } else resultBox.replaceChildren();
    }
  });
  controls.addEventListener('input', () => {
    replay.reset();
    onSettings?.(readSettings());
  });
  host.querySelector('[data-restore]').onclick = () => {
    applySettings();
    replay.reset();
    onSettings?.(readSettings());
  };
  saveBaseline.onclick = () => {
    if (!finished) return;
    baseline = result.checks.map(c => ({ ...c }));
    renderResults();
    host.querySelector('.module-result').textContent = 'Baseline saved from the completed trace.';
  };
  globalThis.lucide?.createIcons();
  return () => { replay.destroy(); host.remove(); };
}
