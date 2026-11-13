import { linuxFinalProject, linuxModules, linuxProjectRubric } from './linux-course-content.js';
import { linuxCourseLabs } from './linux-course-labs.js';
import { systemsLabs } from './systems-labs.js';
import { mountLabWorkbench } from './lab-workbench.js';
import { mountReplay } from './replay.js';
import { assessmentPolicy } from './course-catalog.js';

function add(parent, tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

const storageKey = 'kryptnet:linux-server-administration:practice:v1';

function readPractice() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) return saved;
  } catch { /* Practice can continue in memory. */ }
  return {};
}

function mountWalkthrough(host, frames) {
  host.innerHTML = '<div class="lab-controls"><button type="button" data-play></button>' +
    '<button type="button" data-next>Next step</button><button type="button" data-reset>Restart</button></div>' +
    '<div class="linux-terminal"><p class="linux-terminal-label">Simulated terminal</p>' +
    '<pre><code data-command></code></pre><pre data-output></pre></div>' +
    '<p class="module-result" role="status"></p>';

  const command = host.querySelector('[data-command]');
  const output = host.querySelector('[data-output]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let animation = 0;
  let lastIndex = -2;
  function show(index, events, state) {
    if (index === lastIndex && !['pause', 'speed', 'load'].includes(state.reason)) return;
    lastIndex = index;
    cancelAnimationFrame(animation);
    const frame = events[index];
    const line = frame ? '$ ' + frame.command : '$';
    const response = frame ? (frame.output || '[no output]') : 'Select Play or Next step.';
    output.textContent = response;
    output.classList.toggle('linux-terminal-error', Boolean(frame?.failed));
    command.textContent = line;
    command.setAttribute('aria-label', line);
    if (state.reason !== 'play' || reducedMotion.matches || !frame) return;
    const start = performance.now();
    const duration = Math.min(900, line.length * 15) / state.speed;
    command.textContent = '$ ';
    output.textContent = '';
    function type(now) {
      const count = Math.max(2, Math.ceil((now - start) / duration * line.length));
      command.textContent = line.slice(0, count);
      if (count < line.length) animation = requestAnimationFrame(type);
      else output.textContent = response;
    }
    animation = requestAnimationFrame(type);
  }
  return mountReplay(host, {
    build: () => frames.map(item => ({ ...item, message: item.note })),
    onFrame: show,
    playLabel: 'Play walkthrough',
    delay: 2400,
  });
}

function addLesson(parent, lesson, index) {
  const details = add(parent, 'details', '', 'linux-lesson');
  add(details, 'summary', index + '. ' + lesson.title);
  add(details, 'p', lesson.objective, 'linux-objective');
  add(details, 'p', lesson.concepts);
  const demo = add(details, 'div', '', 'linux-walkthrough');
  const knowledge = add(details, 'details', '', 'lab-checkpoint');
  add(knowledge, 'summary', 'Knowledge check');
  add(knowledge, 'p', lesson.question);
  const answer = add(knowledge, 'details');
  add(answer, 'summary', 'Show answer');
  add(answer, 'p', lesson.answer);

  let replay;
  details.addEventListener('toggle', () => {
    if (details.open && !replay) replay = mountWalkthrough(demo, lesson.frames);
    if (!details.open && replay?.snapshot().running) replay.pause();
  });
}

function downloadReport(modules, practice) {
  const report = ['KryptNet Training Labs', 'Linux Server Administration practice report', 'Browser simulation evidence', ''];
  for (const module of modules) {
    report.push(module.title, '');
    for (const id of module.labs) {
      const evidence = practice[id]?.evidence;
      if (!evidence) continue;
      report.push(evidence.title);
      for (const event of evidence.events) {
        if (event.command) report.push('$ ' + event.command, event.output || '[no output]');
        report.push(event.message);
      }
      for (const check of evidence.checks) {
        report.push((check.ok ? 'Pass - ' : 'Needs attention - ') + check.label + ' - ' + check.detail);
      }
      for (const [label, value] of evidence.facts || []) report.push(label + ' - ' + value);
      report.push('');
    }
    report.push('Troubleshooting notes', typeof practice[module.id]?.notes === 'string' ? practice[module.id].notes : '', '');
  }
  const url = URL.createObjectURL(new Blob([report.join('\n')], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'kryptnet-linux-practice-report.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mountLinuxCourse(parent, navigation, intro) {
  intro.textContent = 'Learn to install, administer, maintain, back up, and troubleshoot Ubuntu Server 24.04 LTS. Five modules · About 35 hours of self-paced study and practice.';
  parent.classList.add('linux-course');
  const preparation = add(parent, 'details', '', 'linux-lesson');
  add(preparation, 'summary', 'Set up an optional practice VM');
  add(preparation, 'p', 'Browser labs model Ubuntu Server and display illustrative command output. They run entirely as simulations. For hands-on command practice, use a disposable Ubuntu Server 24.04 LTS VM with 2 vCPUs, 4 GiB RAM, a 30 GiB system disk, and an optional preformatted 5 GiB data volume labeled KRYPTLABDATA.');
  add(preparation, 'p', 'Use a named student account with sudo, an isolated network with access limited to an approved repository as needed, and a snapshot before each lab. Verify the VM, disk, account, and paths before making changes. Run disk, package, service, and account changes only inside that disposable guest.');
  add(preparation, 'p', 'The walkthroughs show shortened, illustrative output. Save your own observed transcript and verification evidence when practicing on a VM.');

  const practice = readPractice();
  const labs = new Map([...systemsLabs.linux, ...linuxCourseLabs].map(lab => [lab.id, lab]));
  const progress = add(parent, 'p', '', 'linux-progress');
  progress.setAttribute('role', 'status');
  function updateProgress() {
    const passed = linuxModules.filter(module => module.labs.every(id => practice[id]?.evidence?.passed)).length;
    progress.textContent = passed + ' of ' + linuxModules.length + ' module projects verified in this browser.';
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(practice)); }
    catch { /* In-memory notes and report remain available. */ }
    updateProgress();
  }
  updateProgress();

  function addProject(section, module, final = false) {
    const project = add(section, 'section', '', 'linux-project');
    if (!final) add(project, 'h3', 'Module practical project');
    add(project, 'p', module.project);
    const evidence = add(project, 'p');
    add(evidence, 'strong', 'Evidence to collect');
    evidence.append(' · ' + module.evidence);
    if (final) {
      const rubric = add(project, 'details', '', 'lab-checkpoint');
      add(rubric, 'summary', 'Project rubric');
      const list = add(rubric, 'ul');
      linuxProjectRubric.forEach(([label, points]) => add(list, 'li', label + ' · ' + points + ' points'));
      add(rubric, 'p', 'The project requires at least ' + assessmentPolicy.passMark + '% and all critical access, service, restore, and safety checks. The optional certification assessment uses the separate course assessment link.');
    }
    for (const id of module.labs) {
      const definition = labs.get(id);
      mountLabWorkbench(project, definition, {
        settings: practice[id]?.settings,
        onSettings(settings) {
          practice[id] = { settings };
          save();
        },
        onVerify(settings, result) {
          practice[id] = {
            settings,
            evidence: { ...result, title: definition.title, passed: result.passed ?? result.checks.every(check => check.ok) },
          };
          save();
        },
      });
    }
    const label = add(project, 'label', 'Troubleshooting notes', 'field linux-notes');
    const notes = add(label, 'textarea');
    notes.rows = 3;
    notes.maxLength = 1600;
    notes.value = typeof practice[module.id]?.notes === 'string' ? practice[module.id].notes : '';
    notes.placeholder = 'Record the symptom, evidence, repair, and verification.';
    notes.addEventListener('input', () => {
      practice[module.id] = { notes: notes.value };
      save();
    });
  }
  for (const [index, module] of linuxModules.entries()) {
    const jump = add(navigation, 'a', 'Module ' + (index + 1));
    jump.href = '#' + module.id;
    jump.setAttribute('aria-label', 'Module ' + (index + 1) + ' ' + module.title);
    const section = add(parent, 'section', '', 'systems-lesson linux-module');
    section.id = module.id;
    add(section, 'h2', (index + 1) + '. ' + module.title);
    module.lessons.forEach((lesson, item) => addLesson(section, lesson, (index + 1) + '.' + (item + 1)));
    const reference = add(add(section, 'p', '', 'linux-reference'), 'a', module.reference[0]);
    reference.href = module.reference[1];
    addProject(section, module);
  }
  const finalLink = add(navigation, 'a', 'Final Project');
  finalLink.href = '#' + linuxFinalProject.id;
  const finalSection = add(parent, 'section', '', 'linux-module');
  finalSection.id = linuxFinalProject.id;
  add(finalSection, 'h2', linuxFinalProject.title);
  addProject(finalSection, linuxFinalProject, true);
  const download = add(parent, 'button', 'Download practice report', 'linux-download');
  download.type = 'button';
  download.onclick = () => downloadReport([...linuxModules, linuxFinalProject], practice);
}
