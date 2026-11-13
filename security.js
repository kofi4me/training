import { recordActivity } from './account-nav.js';
import { mountSecurityClass } from './security-class.js';
import { appliedLabs } from './course-practice.js';
import { mountLabWorkbench } from './lab-workbench.js';
import { addOperationNavigation } from './operations-courses.js';
const routingLink = document.createElement('a');
routingLink.href = 'fundamentals.html?course=routing';
routingLink.textContent = 'Routing';
document.querySelector('.training-nav a[href*="course=vlans"]')?.after(routingLink);
const switchingLink = document.createElement('a');
switchingLink.href = 'fundamentals.html?course=switching';
switchingLink.textContent = 'Switching';
routingLink.after(switchingLink);
addOperationNavigation();
import { motionPoints, mountMitmPlayer, mountLoadFlow } from './security-motion.js';
import { initialMitm, poisonCache, inspectSession, gatewayMAC, attackerMAC, initialLoad, loadStep } from './security-core.js';
const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let mitmPlayer, loadFlow, study, latestMitm = null, keepQueuedWork = false;
let lab = new URLSearchParams(location.search).get('lab') === 'ddos' ? 'ddos' : 'mitm';
let mitm = initialMitm(), events = [], message = 'Quarterly budget: 2500 training credits.', config = { legitimate: 40, sources: 10, rate: 20, capacity: 100, link: 1000, limit: 5, attack: false, limiting: false }, load = initialLoad(), timer;
function save() { try { localStorage.setItem('kryptnet-mitm-v1', JSON.stringify({ mitm, events, message })); localStorage.setItem('kryptnet-load-v1', JSON.stringify(config)); } catch { $('#security-notice').textContent = 'Browser storage is unavailable; export an investigation report to retain observations.'; } }
try {
  const saved = JSON.parse(localStorage.getItem('kryptnet-mitm-v1'));
  if (saved && ['poisoned','binding','forwarding','tamper'].every(k => typeof saved.mitm?.[k] === 'boolean') && ['http','https'].includes(saved.mitm.protocol) && typeof saved.message === 'string' && saved.message.length <= 500) { mitm = saved.mitm; if (mitm.binding) mitm.poisoned = false; message = saved.message; events = Array.isArray(saved.events) ? saved.events.filter(e => typeof e === 'string').map(e => e.slice(0, 1000)).slice(-30) : []; }
  const c = JSON.parse(localStorage.getItem('kryptnet-load-v1')); if (c && ['attack','limiting'].every(k => typeof c[k] === 'boolean')) { loadStep(initialLoad(), c); config = c; }
} catch { /* Invalid saved experiments fall back to the baseline. */ }
function log(text) { events.push(text); events = events.slice(-30); save(); }
function diagram(intercepted, forwarding = true) {
  const positions = motionPoints;
  const route = intercepted ? ['client','observer', ...(forwarding ? ['gateway','service'] : [])] : ['client','gateway','service'];
  const links = route.slice(1).map((id,i) => { const a = positions[route[i]], b = positions[id]; return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${intercepted ? '#b47724' : '#16846b'}" stroke-width="3"/>`; }).join('');
  return `<svg class="security-diagram" viewBox="0 0 820 290" role="group" aria-label="${intercepted ? 'Client traffic is redirected through the intermediary' : 'Normal client to gateway to service path'}">${links}${Object.entries(positions).map(([id,[x,y]]) => `<g data-security-node="${id}" tabindex="0" role="button" aria-label="Inspect ${id}" transform="translate(${x},${y})"><rect x="-63" y="-37" width="126" height="105" rx="5" fill="white" stroke="${id === 'observer' ? '#b47724' : '#ccd9d1'}"/><image href="assets/devices/${id === 'gateway' ? 'router' : 'host'}.webp" x="-52" y="-30" width="104" height="50"/><text y="38" text-anchor="middle">${{client:'Client PC',observer:'Intermediary PC',gateway:'Gateway R1',service:'Service endpoint'}[id]}</text><text y="54" class="diagram-detail" text-anchor="middle">${id === 'observer' ? '192.168.50.66' : id === 'client' ? '192.168.50.10' : id === 'gateway' ? '192.168.50.1' : 'Remote application'}</text></g>`).join('')}</svg>`;
}
const reportButton = '<button id="export-security"><i data-lucide="download"></i>Export investigation</button>';
function renderMitm() {
  study?.destroy();
  $('#security-notice').textContent='';
  mitmPlayer?.destroy();
  $('#security-title').textContent = 'MiTM and ARP Investigation';
  $('#security-root').innerHTML = `<section class="security-lesson"><h2>Objective: distinguish interception, disclosure, and disruption</h2><p>Observe how a changed gateway mapping redirects a client\'s frames. Compare plaintext HTTP with a modeled, correctly authenticated HTTPS session.</p><ol><li>Send a baseline message and record the legitimate gateway MAC.</li><li>Simulate an ARP mapping change, then send again using HTTP. Inspect the observer and recipient views.</li><li>Compare HTTPS, disable intermediary forwarding, and test the trusted-binding defense.</li></ol></section><div class="security-workspace"><section class="security-evidence"><div class="section-bar"><h2>Traffic path and client ARP mapping</h2>${reportButton}</div><div id="mitm-path"></div><div class="table-wrap"><table><thead><tr><th>Gateway IP</th><th>Expected MAC</th><th>Current client mapping</th></tr></thead><tbody><tr><td>192.168.50.1</td><td>${gatewayMAC}</td><td id="mapping-value"></td></tr></tbody></table></div><div class="security-transcript" id="session-result" aria-live="polite"><p>Send a baseline message to establish the expected path.</p></div></section><aside class="security-settings"><h2>Experiment controls</h2><label class="field">Application protocol<select id="mitm-protocol"><option value="https">HTTPS / authenticated TLS</option><option value="http">HTTP / plaintext</option></select></label><label class="field">Synthetic application message<textarea id="mitm-message" maxlength="500" rows="4">${esc(message)}</textarea></label><label class="toggle-row"><input id="mitm-forward" type="checkbox" ${mitm.forwarding ? 'checked' : ''}>Intermediary forwards traffic</label><label class="toggle-row"><input id="mitm-tamper" type="checkbox" ${mitm.tamper ? 'checked' : ''}>Attempt plaintext modification</label><label class="toggle-row"><input id="mitm-binding" type="checkbox" ${mitm.binding ? 'checked' : ''}>Enforce trusted gateway binding</label><div class="security-buttons"><button id="poison-cache">Simulate ARP change</button><button id="restore-cache">Restore legitimate mapping</button><button id="send-session" class="primary">Send application message</button><button id="reset-mitm" title="Reset experiment"><i data-lucide="rotate-ccw"></i></button></div><p class="field-note">The binding control pins the modeled gateway mapping and repairs an existing mismatch. It is a simplified defense, not a full Dynamic ARP Inspection implementation.</p></aside></div><section class="security-log"><div class="section-bar"><h2>Investigation evidence</h2><span class="subtle">Latest 30 synthetic events</span></div><ol id="mitm-events"></ol></section><details class="security-reading"><summary>Explanation, interpretation, and references</summary><p>ARP resolves an on-link IPv4 address to an Ethernet address. This experiment assumes an intermediary on the same Layer 2 network and models acceptance of an incorrect gateway mapping. Redirection alone does not guarantee successful bidirectional interception on every real network. The return path and intermediary positioning are assumed here. <a href="https://www.rfc-editor.org/rfc/rfc826">ARP specification: RFC 826</a>.</p><p>Correctly authenticated TLS protects application content against network eavesdropping and undetected modification; it does not prevent an on-path device from dropping traffic. The HTTPS view is an illustrative visibility rule, not implemented cryptography, certificate validation, or a TLS capture. <a href="https://www.rfc-editor.org/rfc/rfc9846">TLS 1.3 specification: RFC 9846</a>.</p><p><strong>Report:</strong> record the original and altered mappings, whether delivery continued, which message fields were visible, and the observed effect of each defense. Explain why encryption and availability are different properties. Exported evidence is a local study record, not an assessed certificate.</p></details>`;
  const scenario = document.createElement('div'); scenario.className = 'scenario-bar';
  scenario.innerHTML = '<label>Experiment preset<select id="mitm-preset"><option value="">Custom settings</option><option value="baseline">Normal HTTPS path</option><option value="plaintext">Redirected HTTP</option><option value="encrypted">Redirected HTTPS</option><option value="defended">Trusted-binding defense</option><option value="disrupted">Forwarding disruption</option></select></label><span>Choose a comparison, then send a message or step through its path.</span>';
  $('#mitm-path').before(scenario);
  $('#mitm-preset').onchange = event => {
    const presets = { baseline: initialMitm(), plaintext: {...initialMitm(), protocol:'http',poisoned:true}, encrypted: {...initialMitm(),poisoned:true}, defended: {...initialMitm(),binding:true}, disrupted: {...initialMitm(),poisoned:true,forwarding:false} };
    if (!presets[event.target.value]) return;
    mitm = presets[event.target.value]; latestMitm = null; log('Experiment preset: '+event.target.selectedOptions[0].textContent+'.'); save(); renderMitm(); $('#send-session').click();
  };
  $('#mitm-protocol').value = mitm.protocol;
  $('#mitm-protocol').onchange = e => { mitm.protocol = e.target.value; changedMitm(); };
  $('#mitm-message').oninput = e => { message = e.target.value; save(); };
  for (const [id,key] of [['mitm-forward','forwarding'],['mitm-tamper','tamper'],['mitm-binding','binding']]) $('#' + id).onchange = e => { mitm[key] = e.target.checked; if (key === 'binding' && mitm.binding) mitm.poisoned = false; log(`Control changed: ${key} = ${mitm[key]}.`); changedMitm(); };
  $('#poison-cache').onclick = () => { mitm = poisonCache(mitm); log(mitm.binding ? 'Trusted binding rejected the synthetic mapping change.' : 'Client gateway mapping changed to intermediary MAC ' + attackerMAC + '.'); changedMitm(); };
  $('#restore-cache').onclick = () => { mitm.poisoned = false; log('Client gateway mapping restored to ' + gatewayMAC + '.'); changedMitm(); };
  $('#reset-mitm').onclick = () => { mitm = initialMitm(); latestMitm = null; events = []; message = 'Quarterly budget: 2500 training credits.'; save(); renderMitm(); };
  $('#send-session').onclick = () => {
    if (!message.trim()) { $('#security-notice').textContent = 'Enter a synthetic message before sending.'; return; }
    const r = inspectSession(mitm, message);
    latestMitm = { lab:'mitm', modelVersion:2, probeId:crypto.randomUUID(), observedAt:new Date().toISOString(), metrics:[{label:'Application protocol',value:mitm.protocol.toUpperCase()},{label:'Client gateway mapping',value:r.gatewayMAC},{label:'Traffic redirected',value:r.intercepted},{label:'Message delivered',value:r.delivered},{label:'Content readable to intermediary',value:r.readable},{label:'Content modified',value:r.changed}] };
    $('#session-result').innerHTML = `<h3>${r.delivered ? 'Message delivered' : 'Message not delivered'}</h3><dl><dt>Intermediary observation</dt><dd id="observer-view">${esc(r.observer)}</dd><dt>Recipient application</dt><dd id="recipient-view">${r.delivered ? esc(r.recipient) : 'No message received; the intermediary stopped forwarding.'}</dd><dt>Interpretation</dt><dd>${r.changed ? 'Plaintext content changed in transit.' : mitm.protocol === 'https' && r.intercepted ? 'Application content remains protected in the modeled authenticated TLS session; delivery can still be disrupted.' : r.intercepted ? 'Traffic traversed the intermediary.' : 'The observed path matches the legitimate gateway mapping.'}</dd></dl>`;
    log(`${mitm.protocol.toUpperCase()} message: redirected=${r.intercepted}, delivered=${r.delivered}, readable=${r.readable}, modified=${r.changed}.`); updateMitm(); mitmPlayer.playAuto(); announceObservation();
  };
  exportHandler(); updateMitm(); attachStudy(); lucide.createIcons();
}
function changedMitm() { latestMitm = null; $('#session-result').innerHTML = '<p>Configuration changed. Send a new application message to obtain current evidence.</p>'; save(); updateMitm(); announceObservation(); }
function updateMitm() { mitmPlayer?.destroy(); $('#mitm-path').innerHTML = diagram(mitm.poisoned, mitm.forwarding); $('#mapping-value').textContent = mitm.poisoned ? attackerMAC + ' / MISMATCH' : gatewayMAC + ' / Expected'; $('#mitm-events').innerHTML = events.map(e => `<li>${esc(e)}</li>`).join('') || '<li>No events recorded.</li>'; mitmPlayer = mountMitmPlayer($('#mitm-path'), inspectSession(mitm,message), mitm); lucide.createIcons(); }
function slider(id, label, min, max, value, unit) { return `<label class="field">${label} <output id="${id}-value">${value} ${unit}</output><input type="range" id="${id}" min="${min}" max="${max}" value="${value}"></label>`; }
function renderDdos() {
  study?.destroy();
  $('#security-notice').textContent='';
  loadFlow?.destroy();
  $('#security-title').textContent = 'DoS and DDoS Investigation';
  $('#security-root').innerHTML = `<section class="security-lesson"><h2>Objective: explain availability under competing demand</h2><p>Compare baseline operation, one-source overload, distributed load, and mitigation. Every step represents one synthetic second.</p><ol><li>Step forward with attack load disabled and establish a baseline.</li><li>Enable attack load. Compare one source at 100 requests/s with 20 sources at 5 requests/s: both offer 100 attack requests/s.</li><li>Enable per-source limiting and compare the two cases. Reduce link capacity to investigate a bottleneck before the limiter.</li></ol></section><div class="security-workspace"><section class="security-evidence"><div class="section-bar"><h2>Service-capacity dashboard</h2>${reportButton}</div><div class="load-stats" id="load-stats"></div><div id="load-flow"></div><canvas id="load-chart" width="1000" height="300" role="img" aria-label="Synthetic incoming load, service capacity, and queued work over time"></canvas><p class="chart-legend"><span>Blue: incoming requests/s</span><span>Green: service capacity/s</span><span>Gold: queued requests</span></p><div class="table-wrap"><table><thead><tr><th>Second</th><th>Incoming /s</th><th>Legitimate processed</th><th>Legitimate lost</th><th>Filtered</th><th>Queued</th></tr></thead><tbody id="load-history"></tbody></table></div></section><aside class="security-settings"><h2>Workload and defenses</h2>${slider('legitimate','Legitimate load (20 clients)',0,200,config.legitimate,'requests/s')}${slider('sources','Attack sources',1,100,config.sources,'sources')}${slider('rate','Rate per attack source',1,100,config.rate,'requests/s')}${slider('capacity','Service capacity',20,300,config.capacity,'requests/s')}${slider('link','Upstream link capacity',50,2000,config.link,'requests/s')}${slider('limit','Per-source admission limit',1,100,config.limit,'requests/s')}<label class="toggle-row"><input type="checkbox" id="load-attack" ${config.attack ? 'checked' : ''}>Attack load enabled</label><label class="toggle-row"><input type="checkbox" id="load-limiting" ${config.limiting ? 'checked' : ''}>Per-source limiter enabled</label><div class="security-buttons"><button id="load-step" class="primary">Step 1 second</button><button id="load-run">Run</button><button id="load-reset" title="Reset workload and evidence"><i data-lucide="rotate-ccw"></i></button></div><p class="field-note">Run pauses automatically after 120 steps. Reset restores the baseline configuration and clears the recorded timeline.</p></aside></div><details class="security-reading"><summary>Model, experiment interpretation, and references</summary><p>DoS reduces service availability by exhausting a constrained resource; DDoS uses distributed sources. Request volume alone does not establish malicious intent. The attack sources in this exercise are labelled synthetic inputs. Defenses can have side effects and may not protect every bottleneck. <a href="https://www.rfc-editor.org/rfc/rfc4732">Internet Denial-of-Service Considerations: RFC 4732</a>.</p><p>This deterministic fluid model uses a shared 200-request buffer and proportional service and overflow allocation in 10 ms integration intervals with uniform arrivals, not individual packet timing or a full FIFO server. Waiting capacity is enforced after concurrent service within each interval. Fractional counts represent aggregate expected volumes. An upstream bottleneck proportionally drops traffic before the limiter. The per-source limiter applies equally to each of 20 legitimate clients and each synthetic attack source; it can reject legitimate requests. Buffered work continues after incoming attack load stops.</p><p>The chart separates incoming requests/s, configured service capacity/s, and queued request count; these are distinct measurements. Totals include the whole current experiment, so recovery does not erase earlier losses. No TCP, SYN floods, amplification, packet generation, external targets, or real performance measurements are implemented.</p><p><strong>Report:</strong> compare equal aggregate load from one and multiple sources, identify the constrained resource, and explain whether the limiter protects legitimate traffic in each case. Export evidence before Reset. Settings persist separately from MiTM; the time series starts fresh when the page is reloaded. Assessments for this course are forthcoming.</p></details>`;
  const presets = document.createElement('div'); presets.className = 'scenario-bar';
  presets.innerHTML = '<label>Experiment preset<select id="load-preset"><option value="">Custom settings</option><option value="baseline">Normal demand</option><option value="single">One source / 100 requests per second</option><option value="distributed">20 sources / 5 requests per second</option><option value="mitigated">Distributed load with rate limiting</option><option value="upstream">Upstream bottleneck</option></select></label><span>Presets start independent trials unless queue preservation is enabled. Step or Run records the next observation.</span>';
  $('#load-stats').before(presets);
  $('#load-preset').onchange = event => {
    const base={legitimate:40,sources:10,rate:20,capacity:100,link:1000,limit:5,attack:false,limiting:false};
    const scenarios={baseline:base,single:{...base,attack:true,sources:1,rate:100},distributed:{...base,attack:true,sources:20,rate:5},mitigated:{...base,attack:true,limiting:true},upstream:{...base,attack:true,limiting:true,link:60}};
    if(scenarios[event.target.value]){pause();if(!keepQueuedWork)load=initialLoad();config=scenarios[event.target.value];save();renderDdos();}
  };
  const recoveryOption=document.createElement('label');recoveryOption.className='toggle-row recovery-option';recoveryOption.innerHTML='<input id="keep-queued-work" type="checkbox" '+(keepQueuedWork?'checked':'')+'>Keep queued work between presets (recovery experiment)';
  presets.append(recoveryOption);$('#keep-queued-work').onchange=event=>{keepQueuedWork=event.target.checked;};
  loadFlow = mountLoadFlow($('#load-flow'));
  for (const key of ['legitimate','sources','rate','capacity','link','limit']) $('#' + key).oninput = e => { config[key] = Number(e.target.value); $('#' + key + '-value').textContent = e.target.value + (key === 'sources' ? ' sources' : ' requests/s'); save(); loadFlow.update(config,load,false); };
  $('#load-attack').onchange = e => { config.attack = e.target.checked; save(); loadFlow.update(config,load,false); };
  $('#load-limiting').onchange = e => { config.limiting = e.target.checked; save(); loadFlow.update(config,load,false); };
  $('#load-step').onclick = step;
  $('#load-run').onclick = () => { if (timer) pause(); else { timer = setInterval(step, 1000); $('#load-run').textContent = 'Pause'; } };
  $('#load-reset').onclick = () => { pause(); keepQueuedWork=false; load = initialLoad(); config = { legitimate:40,sources:10,rate:20,capacity:100,link:1000,limit:5,attack:false,limiting:false }; save(); renderDdos(); };
  exportHandler(); updateLoad(false); attachStudy(); lucide.createIcons();
}
function pause() { loadFlow?.pause(); clearInterval(timer); timer = null; if ($('#load-run')) $('#load-run').textContent = 'Run'; }
function step() { if (load.tick >= 120) { pause(); $('#security-notice').textContent = 'The 120-step experiment is complete. Export evidence or reset to begin another run.'; return; } load = loadStep(load, config); load.history.at(-1).observedAt = new Date().toISOString(); load.history.at(-1).probeId = crypto.randomUUID(); updateLoad(); announceObservation(); }
const n = value => Number(value.toFixed(1));
function updateLoad(animate = true) {
  loadFlow?.update(config, load, animate);
  const queued = load.qLegit + load.qAttack;
  $('#load-stats').innerHTML = [['Synthetic time',load.tick + ' s'],['Legitimate processed',n(load.processed)],['Legitimate lost',n(load.losses)],['Current queue',n(queued) + ' / 200']].map(([label,value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
  $('#load-history').innerHTML = [...load.history].slice(-10).reverse().map(r => `<tr><td>${r.tick}</td><td>${n(r.incoming)}</td><td>${n(r.servedL)}</td><td>${n(r.lostL)}</td><td>${n(r.filtered)}</td><td>${n(r.queue)}</td></tr>`).join('') || '<tr><td colspan="6">Step forward to collect observations.</td></tr>';
  const canvas = $('#load-chart'), ctx = canvas.getContext('2d'), width = canvas.width, height = canvas.height, max = Math.max(200, ...load.history.map(r => Math.max(r.incoming,r.capacity,r.queue)));
  ctx.fillStyle = '#fcfefd'; ctx.fillRect(0,0,width,height); ctx.font = '12px Arial'; ctx.fillStyle = '#687875'; ctx.fillText('Synthetic observations / per-step rates and queue count',55,25);
  for (let i=0;i<=4;i++) { const y=50+i*50; ctx.strokeStyle='#e3eae5'; ctx.beginPath();ctx.moveTo(55,y);ctx.lineTo(width-25,y);ctx.stroke(); ctx.fillStyle='#687875';ctx.fillText(String(Math.round(max*(1-i/4))),5,y+4); }
  for(const [key,color] of [['incoming','#3568d4'],['capacity','#16846b'],['queue','#b58b2f']]){ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();load.history.forEach((r,i)=>{const x=55+i*(width-80)/Math.max(1,load.history.length-1),y=250-r[key]/max*200;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();if(load.history.length===1){ctx.fillStyle=color;ctx.beginPath();ctx.arc(55,250-load.history[0][key]/max*200,4,0,Math.PI*2);ctx.fill();}}
  ctx.fillStyle='#687875';ctx.fillText('Recent synthetic seconds',55,285);
}
function announceObservation(){ window.dispatchEvent(new Event('security-observation')); }
function snapshot(){
  if(lab==='mitm')return latestMitm;
  const row=load.history.at(-1);if(!row)return null;
  return {lab:'ddos',modelVersion:2,probeId:row.probeId,observedAt:row.observedAt,metrics:[{label:'Synthetic step',value:row.tick},{label:'Incoming requests/s',value:row.incoming},{label:'Application capacity/s',value:row.capacity},{label:'Legitimate processed in step',value:row.servedL},{label:'Legitimate lost in step',value:row.lostL},{label:'Legitimate lost upstream in step',value:row.upstreamLostL},{label:'Requests filtered in step',value:row.filtered},{label:'Queue after step',value:row.queue},{label:'Legitimate offered in step',value:row.settings.legitimate},{label:'Legitimate lost at limiter in step',value:row.limiterLostL},{label:'Synthetic attack active',value:row.settings.attack}]};
}
function attachStudy(){
  study=mountSecurityClass({lab,snapshot,freshStart:()=>{pause();latestMitm=null;if(lab==='mitm'){mitm=initialMitm();events=[];save();renderMitm();}else{keepQueuedWork=false;load=initialLoad();config={legitimate:40,sources:10,rate:20,capacity:100,link:1000,limit:5,attack:false,limiting:false};save();renderDdos();}},probe:()=>lab==='mitm'?$('#send-session').click():step(),applyCase:id=>{
    pause();latestMitm=null;
    if(lab==='mitm'){
      const base=initialMitm();mitm=id==='A'?{...base,protocol:'http',poisoned:true}:id==='B'?{...base,poisoned:true,forwarding:false}:{...base,poisoned:true};
      events=[];save();renderMitm();
    }else{
      const base={legitimate:40,sources:10,rate:20,capacity:100,link:1000,limit:5,attack:false,limiting:false};
      config=id==='A'?{...base,attack:true}:id==='B'?{...base,attack:true,limiting:true,link:50}:{...base,limiting:true,limit:1};
      load=initialLoad();save();renderDdos();
    }
  }});
}
function exportHandler(){ $('#export-security').onclick=()=>{const record=lab==='mitm'?{lab,model:'synthetic ARP/TLS visibility',settings:mitm,events,message}:{lab,model:'synthetic proportional fluid queue',settings:config,evidence:load};record.study=study?.exportStudy();const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`kryptnet-${lab}-investigation.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}; }
const appliedArea = document.createElement('div');
$('#security-root').after(appliedArea);
const appliedLink = document.createElement('a'); appliedLink.className = 'guide-link';
$('#security-root').before(appliedLink);
let stopApplied = () => {};
function render(){
  pause(); mitmPlayer?.destroy(); loadFlow?.destroy(); stopApplied(); mitmPlayer=null; loadFlow=null;
  $('#security-lab').value=lab; $('#security-notice').textContent='';
  document.querySelectorAll('.training-nav [data-course]').forEach(link=>{if(link.dataset.course===lab)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  if(lab==='mitm')renderMitm();else renderDdos();
  const [definition] = appliedLabs[lab];
  appliedLink.href = '#' + definition.id; appliedLink.textContent = definition.title;
  stopApplied = mountLabWorkbench(appliedArea, definition);
}
$('#security-lab').onchange=e=>{lab=e.target.value;history.replaceState(null,'',`security.html?lab=${lab}`);render();void recordActivity();};
render();
