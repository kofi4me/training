const event = (node, message, command, output) => ({ node, message, ...(command ? { command, output } : {}) });
const check = (label, ok, detail) => ({ label, ok: Boolean(ok), detail });
const result = (events, checks, facts = []) => ({ events, checks, facts });
const invalid = (label, detail) => result([event(0, detail)], [check(label, false, detail)]);
const namePattern = /^[a-z_][a-z0-9_-]{0,23}$/;
const validMode = mode => /^[0-7]{3,4}$/.test(mode);
const has = (bits, mask) => (bits & mask) === mask;

export function linuxAccounts(c) {
  const names = [c.group, c.operator, c.analyst];
  if (names.some(name => typeof name !== 'string' || !namePattern.test(name))) return invalid('Users and group created', 'Enter three names of 1-24 lowercase letters, digits, underscores or hyphens, starting with a letter or underscore.');
  if (new Set([...names, 'root', 'guest', 'portal']).size !== 6) return invalid('Users and group created', 'Choose distinct names. root, guest and portal already exist in this exercise.');
  if (!validMode(c.mode)) return invalid('Users and group created', 'Enter three or four octal digits (0-7). No account or directory changes were simulated.');
  const mode = parseInt(c.mode, 8);
  const members = [[c.operator, c.addOperator], [c.analyst, c.addAnalyst], ['guest', c.addGuest]];
  const assigned = members.filter(([, included]) => included).map(([user]) => user);
  const effective = c.fresh ? assigned : [];
  const bits = user => c.ownerGroup === 'team' && effective.includes(user) ? (mode >> 3) & 7 : mode & 7;
  const writes = user => has(bits(user), 3);
  const guestDenied = bits('guest') === 0;
  const inherited = writes(c.operator) && c.ownerGroup === 'team' && has(mode, 0o2000);
  return result([
    event(0, `Created shared group ${c.group} (GID 2000).`, 'sudo groupadd -- ' + c.group, ''),
    event(0, `Created ${c.operator} with a private primary group and home directory.`, 'sudo useradd -m -U -- ' + c.operator, ''),
    event(0, `Created ${c.analyst} with a separate private primary group and home directory.`, 'sudo useradd -m -U -- ' + c.analyst, ''),
    event(0, 'Read the created account record.', 'getent passwd ' + c.operator, c.operator + ':x:2001:2001::/home/' + c.operator + ':/bin/sh'),
    event(0, 'Check the recorded supplementary group members.', 'getent group ' + c.group, c.group + ':x:2000:' + assigned.join(',')),
    event(1, 'Inspect the shared directory owner, group, and mode.', 'stat -c "%U %G %a" /srv/support', 'root ' + (c.ownerGroup === 'team' ? c.group : 'root') + ' ' + mode.toString(8)),
    event(2, c.fresh ? 'Fresh sessions loaded the current group memberships.' : 'Existing sessions still carry the group IDs from before the membership change.'),
    event(2, `${c.operator}: ${writes(c.operator) ? 'can create a file' : 'cannot create a file'}; ${c.analyst}: ${writes(c.analyst) ? 'can create a file' : 'cannot create a file'}.`),
    event(2, `guest: ${guestDenied ? 'no directory permissions' : 'has directory permission bits'}. ${inherited ? 'A new file inherits the shared group.' : 'Shared group inheritance was not demonstrated.'}`)
  ], [
    check('Users and group created', true, `${c.operator} and ${c.analyst} have distinct UIDs and private primary groups; ${c.group} exists.`),
    check('Both members can create files', writes(c.operator) && writes(c.analyst) && c.addOperator && c.addAnalyst, 'Verify supplementary membership, directory group ownership, group write + search and fresh login sessions.'),
    check('Guest excluded', guestDenied && !c.addGuest, 'The guest must be outside the team and receive no directory access.'),
    check('New file inherits the team group', inherited, 'Set-group-ID on the directory controls inherited group ownership, not the new file permission bits.')
  ], [['Account database membership', assigned.join(', ') || 'None'], ['Effective membership in probe sessions', effective.join(', ') || 'None']]);
}

export function linuxPermissions(c) {
  if (![c.directory, c.file].every(validMode)) return invalid('Octal modes', 'Enter three or four octal digits for each path.');
  const parent = parseInt(c.directory, 8), file = parseInt(c.file, 8);
  const staffSearch = has(parent >> 3, 1);
  const guestSearch = has(parent, 1);
  const read = staffSearch && has(file >> 3, 4), write = staffSearch && has(file >> 3, 2);
  const canReplace = has(parent >> 3, 3) && !has(parent, 0o1000);
  return result([
    event(0, 'The analyst belongs to reports. The guest matches neither the owner nor the group.'),
    event(1, `The analyst ${staffSearch ? 'can' : 'cannot'} traverse /srv/reports. The guest ${guestSearch ? 'can' : 'cannot'} traverse it.`, 'stat -c "%U %G %a" /srv/reports', 'root reports ' + parent.toString(8)),
    event(2, `Analyst write ${write ? 'allowed' : 'denied'}. Directory replacement ${canReplace ? 'allowed' : 'denied'}.`, 'sudo -u analyst -- test -r /srv/reports/weekly.txt; echo "$?"', read ? '0' : '1')
  ], [check('Analyst reads the file', read, 'The parent must grant group search and the file must grant group read.'),
    check('Analyst cannot alter the report', !write && !canReplace, 'Protect both the file contents and its directory entry.'),
    check('Guest cannot traverse', !guestSearch, 'Remove search permission from the directory other class.')],
  [['Known path', '/srv/reports/weekly.txt'], ['Owner and group', 'root:reports for both objects']]);
}

export function linuxService(c) {
  const canBind = c.port === '8081' || !c.portOccupied;
  const active = c.start && c.configReadable && canBind;
  const probe = active && c.port === c.clientPort;
  const reboot = c.enabled && c.configReadable && canBind && c.port === c.clientPort;
  return result([
    event(0, c.configReadable ? 'portal can read /etc/portal/config.ini.' : 'portal cannot read /etc/portal/config.ini (EACCES).'),
    event(1, `The socket on ${c.port} is ${canBind ? 'available' : 'occupied by the legacy listener'}.`),
    event(1, !c.start ? 'No start requested.' : active ? 'portal.service entered active state.' : `Start failed: ${!c.configReadable ? 'config access denied' : 'address already in use'}.`),
    event(2, `Probe the Portal endpoint on ${c.clientPort}.`, 'curl -fsS --max-time 3 http://127.0.0.1:' + c.clientPort + '/health', probe ? 'Portal ready' : 'No valid Portal response'),
    event(1, `Simulated reboot: ${c.enabled ? 'unit is enabled at boot' : 'unit is not enabled'}.`),
    event(2, 'Repeat the application probe after a simulated reboot.', 'curl -fsS --max-time 3 http://127.0.0.1:' + c.clientPort + '/health', reboot ? 'Portal ready' : 'No valid Portal response')
  ], [check('Service responds now', probe, 'Fix configuration access and binding; the client must target the service port.'),
    check('Service responds after reboot', reboot, 'Enabling and starting the unit are separate operations.'),
    check('Legacy listener preserved', c.portOccupied, 'Migrate Portal without removing the other service on port 8080.')],
  [['Service identity', 'portal (non-root)'], ['Link reachability', 'Host reachable throughout; this does not test the application']]);
}

export function logAudit(c) {
  if (!/^[1-9][0-9]?$/.test(c.threshold)) return invalid('Threshold', 'Use an integer from 1 to 99.');
  const rows = ['portal,INFO', 'portal,ERROR', 'backup,ERROR', 'portal,ERROR', 'portal,WARN', ...(c.badRow ? ['portal,UNKNOWN'] : [])];
  const events = [event(0, 'Opened the synthetic log after validating the threshold.')];
  let errors = 0, rejected = 0, aborted = false;
  for (const row of rows) {
    const [service, severity] = row.split(',');
    if (!['INFO', 'WARN', 'ERROR'].includes(severity)) {
      rejected++;
      events.push(event(1, `${row}: invalid severity; ${c.skip ? 'count and skip' : 'stop with input failure'}.`));
      if (!c.skip) { aborted = true; break; }
    } else {
      const count = service === c.service && severity === 'ERROR';
      if (count) errors++;
      events.push(event(1, `${row}: ${count ? 'counted' : 'ignored'}; running total ${errors}.`));
    }
  }
  const alert = errors >= Number(c.threshold);
  const code = aborted ? 2 : alert && c.nonzero ? 1 : 0;
  events.push(event(2, aborted ? 'No trustworthy summary. Exit 2 (invalid input).' : `Summary: ${errors} errors, ${rejected} rejected, ${alert ? 'alert' : 'no alert'}, exit ${code}.`));
  return result(events, [check('Portal errors only', !aborted && c.service === 'portal' && errors === 2, `Counted ${errors} for ${c.service}.`),
    check('Bad input reported without losing the result', !aborted && rejected === 1, `Rejected ${rejected}; ${aborted ? 'aborted' : 'summary completed'}.`),
    check('Alert propagates to the caller', code === 1 && c.threshold === '2', `Exit ${code}; the runbook threshold is 2, inclusive.`)], [['Rows read', rows.length], ['Exit code', code]]);
}

export function inventoryJob(c) {
  const before = ['ops', 'portal'];
  const entry = c.validInput ? 'reports' : '../reports';
  const events = [event(0, `Inventory initially contains ${before.join(', ')}.`), event(0, c.validInput ? 'Preflight accepted the desired entry: reports.' : 'Preflight rejected an invalid source entry.')];
  let state = before, writes = 0, rerun = 0;
  function apply(inventory) {
    return c.strategy === 'reconcile' && inventory.includes(entry) ? inventory : [...inventory, entry];
  }
  if (c.validInput || !c.requirePreflight) {
    const planned = apply(state);
    events.push(event(1, `Plan: ${planned.join(', ')}. Preview performs no writes.`));
    if (c.apply) {
      writes = planned === state ? 0 : 1;
      state = planned;
      const repeated = apply(state);
      rerun = repeated === state ? 0 : 1;
      state = repeated;
      events.push(event(2, `First apply wrote ${writes} time(s); identical rerun wrote ${rerun} time(s).`));
    }
  } else events.push(event(1, 'Stopped before changing the inventory.'));
  events.push(event(2, `Final inventory: ${state.join(', ')}.`));
  return result(events, [check('Preflight guards all writes', c.requirePreflight, c.validInput ? 'Repeat with invalid input to observe the guard.' : `Invalid-input writes: ${writes + rerun}.`),
    check('Desired entry appears exactly once', c.validInput && state.filter(x => x === 'reports').length === 1, `Final inventory: ${state.join(', ')}.`),
    check('Identical rerun makes no change', c.apply && writes === 1 && rerun === 0, c.apply ? `Rerun writes: ${rerun}.` : 'Enable apply after inspecting the plan.')], [['First apply writes', writes], ['Repeat writes', rerun]]);
}

export function scheduledJob(c) {
  if (!/^(?:[1-9]|1[0-5])$/.test(c.duration)) return invalid('Job duration', 'Enter a duration from 1 to 15 minutes.');
  const overlap = Number(c.duration) > 5;
  const refused = overlap && c.lock;
  const failedCode = c.propagate ? 2 : 0;
  const previousSafe = c.atomic && (!overlap || c.lock);
  const second = event(0, refused ? 'Run B at minute 5 cannot acquire the lock and skips.' : `Run B starts at minute 5${overlap ? ' while A is still running' : ''}.`);
  const failure = [event(1, `Run A fails at minute ${c.duration}. ${c.atomic ? 'A staged file was never published.' : 'A wrote an incomplete live report.'}`), event(2, `The wrapper returned ${failedCode} for the failed writer.`)];
  return result([
    event(0, 'Run A began at minute 0 with a known-good report already published.'),
    ...(overlap ? [second, ...failure] : [...failure, second]),
    event(1, previousSafe ? 'Readers retain the last known-good report during the failed write.' : 'No guarantee that readers saw only a verified report.'),
    event(2, 'A healthy follow-up at minute 20 finishes after the earlier runs and publishes a new report.')
  ], [check('Overlapping run skipped', refused, 'The exercise must demonstrate contention: use a duration greater than five minutes and hold a lock.'),
    check('Failed write preserves previous report', previousSafe, 'Stage output before replacement and prevent concurrent writers.'),
    check('Failure is observable', failedCode !== 0, `Wrapper exit status: ${failedCode}.`)], [['Scheduler starts', 'Minutes 0, 5 and 20'], ['Writer failure', 'Run A, before publication']]);
}

export function recoveryPlan(c) {
  const interval = Number(c.interval);
  if (![15, 30, 60].includes(interval) || !['15', '30', '45'].includes(c.copy)) return invalid('Planning inputs', 'Choose a supported schedule and copy duration.');
  const last = Math.floor(80 / interval) * interval;
  const point = c.latestInvalid ? last - interval : last;
  const age = 80 - point, elapsed = 8 + Number(c.copy) + 10;
  return result([
    event(0, `Incident at minute 80. Scheduled points: ${Array.from({ length: last / interval + 1 }, (_, i) => i * interval).join(', ')}.`),
    event(1, c.latestInvalid ? `Rejected minute ${last}: failed integrity check. Selected usable minute ${point}.` : `Selected the verified point at minute ${point}.`),
    event(2, `Measured simulated loss: 80 - ${point} = ${age} min. Recovery: 8 + ${c.copy} + 10 = ${elapsed} min.`)
  ], [check('Data-loss budget met', age <= 25, `${age} min against a 25 min recovery point objective.`),
    check('Downtime budget met', elapsed <= 45, `${elapsed} min against a 45 min recovery time objective.`),
    check('Failed newest backup included in the test', c.latestInvalid, 'The exercise must demonstrate that a failed backup changes the usable recovery point.')],
  [['Recovery point', `Minute ${point}`], ['Restoration and validation complete', `Minute ${80 + elapsed}`]]);
}

export function restoreChain(c) {
  const steps = c.point === 'full' ? ['01:00 full'] : c.point === 'first' ? ['01:00 full', '02:00 incremental'] : ['01:00 full', '02:00 incremental', '03:00 incremental'];
  const events = [event(0, `Restore needs ${steps.join(' + ')}.`)];
  const corrupt = steps.length > 1 && !c.cleanCopy;
  const blocked = corrupt && c.verify;
  if (c.verify) events.push(event(0, blocked ? 'Integrity verification rejected the required 02:00 object before applying any objects.' : 'All required objects match their expected hashes.'));
  else events.push(event(0, 'Integrity verification bypassed. This is not a trusted restore.'));
  if (!blocked) for (const step of steps) events.push(event(1, `Applied ${step} to ${c.target === 'staging' ? 'an isolated destination' : 'the live destination'}.`));
  const consistent = !blocked && !corrupt;
  events.push(event(2, blocked ? 'No restore was attempted.' : consistent ? 'Sample record and file checks matched the selected point.' : 'Sample data check failed after applying damaged data.'));
  return result(events, [check('Latest point restored', c.point === 'latest' && consistent, 'A recent incremental requires every earlier link, starting at the full backup.'),
    check('Integrity verified before writes', c.verify && !blocked, 'Choose the verified alternate copy and retain the manifest check.'),
    check('Live destination untouched', c.target === 'staging' || blocked, blocked ? 'No writes occurred because preflight stopped the restore.' : c.target === 'staging' ? 'All writes were isolated.' : 'The live destination received restore writes.')]);
}

export function recoveryCutover(c) {
  const source = c.source === 'offline';
  const restored = source && c.isolate;
  const healthy = restored && c.serviceAccess && c.serviceEnabled && c.probe;
  const idempotent = c.automation === 'reconcile';
  const ready = healthy && idempotent;
  const routed = c.cutover && ready;
  return result([
    event(0, c.isolate ? 'Compromised host isolated from the recovery environment.' : 'Compromised host is still connected; clean restore is blocked.'),
    event(0, source ? 'Offline backup and manifest validated.' : 'The latest online copy is marked suspect; recovery must not trust it.'),
    event(1, restored ? `Recovered to staging. Rebuild ran twice: ${idempotent ? 'second run made no changes' : 'duplicate service entry on repeat'}.` : 'No trusted restore was applied.'),
    event(1, !restored ? 'No new service to validate.' : `Portal identity ${c.serviceAccess ? 'can' : 'cannot'} read recovered data; unit ${c.serviceEnabled ? 'starts' : 'does not start'} at boot.`),
    event(2, healthy ? 'A known read and a post-reboot application probe passed.' : 'Application health after reboot was not proven.'),
    event(2, routed ? 'Promoted validated staging service.' : c.cutover ? 'Cutover request refused; preconditions failed.' : 'No cutover requested.')
  ], [check('Trusted restore in isolation', restored, 'Isolate the compromised host and use the validated offline copy.'),
    check('Repeatable rebuild and service validation', ready, 'Reconcile configuration; restore service identity access, enable boot and check known data.'),
    check('Gated cutover', routed, 'Promote only after all checks pass.')], [['Live host', 'Never receives restore writes in this exercise'], ['Cutover', routed ? 'Promoted' : 'Not promoted']]);
}
