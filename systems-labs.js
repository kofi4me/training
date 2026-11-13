import { linuxAccounts, linuxPermissions, linuxService, logAudit, inventoryJob, scheduledJob, recoveryPlan, restoreChain, recoveryCutover } from './systems-models.js';

const flag = (key, label, value = false) => ({ key, label, value });
const text = (key, label, value, maxLength, numeric = false) => ({ key, label, value, maxLength, numeric });
const choice = (key, label, value, options) => ({ key, label, value, options });
const lab = definition => ({ ...definition, nodeIcons: true });
const nist = ['NIST SP 800-34 Rev. 1: Contingency Planning Guide', 'https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final'];

export const systemsLabs = {
  linux: [lab({
    id: 'account-provisioning', title: 'Create Linux users and a shared group', level: 'Beginner',
    brief: 'Provision two local user accounts and a shared group on a Linux training server. Let both team members create files in /srv/support while excluding the existing guest account.',
    background: 'The host begins with root, guest and the portal service identity. The support directory is owned by root:root with mode 0755. Each new user receives a distinct UID, a home directory and a private primary group. The team group is supplementary, not a replacement for the primary group.',
    tasks: [
      'Enter a group name and two distinct usernames. Step through creation and inspect the assigned IDs. Try a duplicate name and confirm that no account changes are simulated.',
      'Assign both accounts to the shared group, leave guest out, and set the directory group to the new group. With mode 0770, inspect the difference between existing and fresh sessions.',
      'Set mode 2770 and use fresh sessions. Verify both users can create a file, guest has no access, and a new file inherits the team group. Save the baseline and try adding guest to see which check fails.'
    ],
    reflection: 'Why is seeing the team in the account database insufficient for a process that was already running?',
    boundary: 'Models local account records, group credentials and directory mode checks. Does not authenticate users, create operating-system accounts, or run commands. Account names use a restricted training convention.',
    reference: ['Linux usermod(8)', 'https://man7.org/linux/man-pages/man8/usermod.8.html'],
    nodes: [['users', 'Accounts'], ['folder', 'Shared folder'], ['shield-check', 'Access probes']],
    fields: [text('group', 'New group name', '', 24), text('operator', 'First new username', '', 24), text('analyst', 'Second new username', '', 24),
      flag('addOperator', 'Add first user to the group'), flag('addAnalyst', 'Add second user to the group'), flag('addGuest', 'Add guest to the group'),
      choice('ownerGroup', 'Directory group owner', 'root', [['root','root'],['team','New shared group']]),
      text('mode', 'Directory mode (octal)', '0755', 4, true), flag('fresh', 'Open fresh user sessions')], run: linuxAccounts
  }), lab({
    id: 'linux-permissions', title: 'Repair read-only access to a report', level: 'Intermediate',
    brief: 'Give the reports group access to a known report without letting its members overwrite or replace it. Deny guests entry to the report directory.',
    background: 'Both /srv/reports and weekly.txt belong to root:reports. The analyst has reports in the effective group list. Other path components are searchable. The starting directory 0750 permits group traversal, but the file 0600 permits only its owner to read it.',
    tasks: [
      'Record the starting failure. Change the file from 0600 to 0640 and observe how read access changes without changing file ownership.',
      'Try directory mode 0740. The group can list names but cannot traverse the directory to open the known report. Compare this with 0710, which permits lookup of a known name without directory listing.',
      'Try directory mode 0770 with the read-only file. Inspect why directory write plus search allows replacing its entry. Restore 0750 or 0710 and confirm the analyst can read, cannot alter the report, and the guest cannot traverse.'
    ],
    reflection: 'Why does checking only the mode on weekly.txt miss a route to replacing the report?',
    boundary: 'Evaluates ordinary Unix mode bits for non-privileged identities with fixed owners. Does not model POSIX ACLs, SELinux, capabilities, mounts or symlinks.',
    reference: ['Linux path_resolution(7)', 'https://man7.org/linux/man-pages/man7/path_resolution.7.html'],
    nodes: [['user', 'Identity'], ['folder', 'Directory'], ['file-text', 'Report']],
    fields: [text('directory', 'Directory mode (octal)', '0750', 4, true), text('file', 'Report mode (octal)', '0600', 4, true)], run: linuxPermissions
  }), lab({
    id: 'linux-service', title: 'Recover a service without breaking its neighbor', level: 'Advanced',
    brief: 'The host is reachable, but the Portal application is unavailable. Restore it on an unused port and prove it survives a reboot without removing the legacy listener.',
    background: 'portal.service runs under the non-root portal identity on a systemd host. It must read /etc/portal/config.ini before it can bind its socket. A separate application owns port 8080; port 8081 is free. The probe requires a Portal response, not just any HTTP response.',
    tasks: [
      'Run the failing trace and save a baseline. Repair configuration access for the service identity, then start it again. Identify which failure becomes visible next.',
      'Move Portal to 8081 and update the client to match. Start the unit. Compare the immediate response with the post-reboot response.',
      'Enable the unit at boot. Run a new trace and confirm both Portal checks and preservation of the legacy listener. Test what happens if you change only the client port.'
    ],
    reflection: 'Which observations distinguish a reachable host, a running unit, and a healthy application?',
    boundary: 'Uses fixed service dependencies and a synthetic local application response. It does not run systemd, open sockets, or emulate network firewalls or unit restart policies.',
    reference: ['systemctl manual', 'https://www.freedesktop.org/software/systemd/man/latest/systemctl.html'],
    nodes: [['file-key', 'Config file'], ['server', 'Service unit'], ['activity', 'Health probe']],
    fields: [flag('configReadable', 'Portal identity can read config'), flag('portOccupied', 'Keep legacy listener on 8080', true),
      choice('port', 'Portal listen port', '8080', [['8080','8080'],['8081','8081']]), choice('clientPort', 'Client probe port', '8080', [['8080','8080'],['8081','8081']]),
      flag('start', 'Start service now', true), flag('enabled', 'Enable at boot')], run: linuxService
  })],
  automation: [lab({
    id: 'automation-log-audit', title: 'Audit a service log and report failures', level: 'Beginner',
    brief: 'Build a log check that counts Portal errors, reports malformed records and signals the caller when the inclusive threshold is reached.',
    background: 'The fixture contains two Portal errors, a Backup error, non-error records and an optional unknown severity. The caller distinguishes normal completion (0), a threshold alert (1), and an input failure (2).',
    tasks: [
      'Step through the input and predict what the counter should do for INFO, WARN, Backup ERROR and an unknown severity. Observe the exit status on strict input handling.',
      'Choose Portal, set the inclusive threshold to 2, keep the bad input, and count and skip the malformed row. Propagate the threshold alert as exit 1.',
      'Raise the threshold to 3 or change the service. Explain why a successful script invocation is not proof that it tested the intended policy.'
    ],
    reflection: 'What evidence differentiates no errors found from could not finish reading the input?',
    boundary: 'The replay applies a fixed two-field fixture and restricted record grammar. The tutorial shows Python source; the browser does not execute Bash or Python.',
    reference: ['Python csv module', 'https://docs.python.org/3/library/csv.html'],
    nodes: [['file-text', 'Log input'], ['list-filter', 'Filter and count'], ['terminal', 'Exit status']],
    fields: [choice('service', 'Service filter', 'portal', [['portal','Portal'],['backup','Backup']]), text('threshold', 'Error threshold', '3', 2, true),
      flag('badRow', 'Include malformed record', true), flag('skip', 'Count and skip malformed record'), flag('nonzero', 'Return nonzero on alert')], run: logAudit
  }), lab({
    id: 'automation-inventory', title: 'Make a configuration change safe to repeat', level: 'Intermediate',
    brief: 'Add reports to a service inventory. A dry run must leave state untouched, an invalid request must be rejected before writes, and a second identical apply must do nothing.',
    background: 'The inventory starts with ops and portal. The desired entry is reports, or an invalid path-like entry in a negative test. Blind append differs from reconciliation: reconciliation checks whether the desired state already exists.',
    tasks: [
      'Run a preview without applying. Enable apply while using append and watch a second identical run produce a duplicate.',
      'Switch to reconciliation and require preflight. Run the valid apply and repeat. Confirm the first run writes once and the second writes zero times.',
      'Set the source invalid and verify that no writes occur. Temporarily disable the guard and inspect the invalid state. Restore it and repeat the negative test.'
    ],
    reflection: 'What would make a script safe to retry after an interrupted run? Identify what this inventory fixture does and does not prove.',
    boundary: 'The inventory is in memory. Each trace starts from the same fixture; it compares two applies within that trace. It does not edit real configuration or run shell commands.',
    reference: ['GNU Bash Reference Manual', 'https://www.gnu.org/software/bash/manual/bash.html'],
    nodes: [['clipboard-check', 'Preflight'], ['list-checks', 'Change plan'], ['database', 'Inventory']],
    fields: [flag('validInput', 'Desired entry is valid', true), flag('requirePreflight', 'Stop if preflight rejects input'),
      choice('strategy', 'Update strategy', 'append', [['append','Blind append'],['reconcile','Reconcile by exact match']]), flag('apply', 'Apply and repeat')], run: inventoryJob
  }), lab({
    id: 'automation-scheduled-job', title: 'Protect a scheduled job from overlapping runs', level: 'Advanced',
    brief: 'Keep a published health report readable when a writer fails and another scheduled run starts before it exits.',
    background: 'Run A begins at minute 0 and fails before successful publication. B starts at minute 5. A separate healthy run starts at minute 20. The consumer must see a verified report, and the scheduler must not receive a false success.',
    tasks: [
      'Run without safeguards. Observe the overlapping start, partial live write and misleading wrapper result. Save the baseline.',
      'Stage the report before atomic replacement, hold an exclusive lock during the run, and return the writer failure code. Verify that B skips and the last valid report is preserved.',
      'Shorten A to five minutes or less. Compare the result with the contention case. Explain why a trace with no overlap cannot verify the lock behavior.'
    ],
    reflection: 'How do mutual exclusion, atomic publication and exit status address three different failure modes?',
    boundary: 'Simulated clock, lock, and writer; no scheduler or filesystem executes. Staging and replacement are modeled on the same filesystem; power-loss durability is not simulated.',
    reference: ['Python os.replace', 'https://docs.python.org/3/library/os.html#os.replace'],
    nodes: [['timer', 'Scheduler'], ['file-output', 'Publisher'], ['bell', 'Job result']],
    fields: [text('duration', 'Run A duration (minutes)', '8', 2, true), flag('lock', 'Hold an exclusive lock'),
      flag('atomic', 'Stage then atomically replace'), flag('propagate', 'Propagate writer exit status')], run: scheduledJob
  })],
  recovery: [lab({
    id: 'recovery-budget', title: 'Calculate recovery objectives from a timeline', level: 'Beginner',
    brief: 'Select a backup schedule and restore method that tolerate the newest backup failing. The business permits 25 minutes of data loss and 45 minutes of downtime.',
    background: 'The service fails at minute 80. Backup points start at minute 0. Recovery requires 8 minutes to prepare, a configurable copy time, and 10 minutes to validate. Backup points are assumed complete and consistent unless rejected.',
    tasks: [
      'Start with a 30-minute schedule and the newest backup marked invalid. Identify the usable recovery point, then subtract it from the incident time.',
      'Compare 30-minute and 15-minute schedules with the failure still present. Do not use the interval alone as evidence of the recovery point.',
      'Reduce copy time and verify that the complete recovery time meets the budget. Compare the first failing run with the repaired plan.'
    ],
    reflection: 'Why is a faster backup schedule not necessarily a faster recovery?',
    boundary: 'A fixed incident time and deterministic operation durations make the arithmetic inspectable. Real completion times, application consistency and recovery dependencies must be measured.',
    reference: nist,
    nodes: [['calendar-clock', 'Schedule'], ['archive', 'Usable copy'], ['timer', 'Recovery time']],
    fields: [choice('interval', 'Backup interval (minutes)', '30', [['15','15'],['30','30'],['60','60']]), flag('latestInvalid', 'Newest backup fails verification', true),
      choice('copy', 'Restore copy time (minutes)', '30', [['15','15'],['30','30'],['45','45']])], run: recoveryPlan
  }), lab({
    id: 'recovery-chain', title: 'Restore a damaged incremental backup chain', level: 'Intermediate',
    brief: 'Recover the 03:00 data point without overwriting live data, even though the primary 02:00 incremental is damaged.',
    background: 'A full image was taken at 01:00. Incrementals at 02:00 and 03:00 each depend on their predecessor. The repository offers a verified alternate copy of 02:00; known sample records and a hash manifest provide separate checks.',
    tasks: [
      'Request 03:00 and inspect which object blocks verification. Try 01:00 alone and note what data point it can and cannot recover.',
      'Use the alternate 02:00 object, keep preflight enabled, and restore to the isolated destination. Confirm the application data sample matches the requested point.',
      'Test the damaged copy without preflight, and then test a valid chain pointed at the live destination. Distinguish content failure from unsafe destination selection.'
    ],
    reflection: 'Why is a correct checksum for the 03:00 object alone insufficient?',
    boundary: 'This models one linear incremental format and fixed object integrity. Real backup products can use different formats. The lab never reads or writes learner files.',
    reference: nist,
    nodes: [['database-backup', 'Repository'], ['folder-open', 'Restore target'], ['shield-check', 'Data check']],
    fields: [choice('point', 'Recovery point', 'latest', [['full','01:00 full'],['first','02:00'],['latest','03:00']]), flag('cleanCopy', 'Use verified alternate 02:00 copy'),
      flag('verify', 'Verify required objects before restoring', true), choice('target', 'Restore destination', 'staging', [['staging','Isolated destination'],['live','Live destination (simulation)']])], run: restoreChain
  }), lab({
    id: 'recovery-capstone', title: 'Recover Portal and verify it before cutover', level: 'Advanced',
    brief: 'Recover a simulated compromised service. Combine Linux identity and service configuration, repeatable automation, and backup recovery without writing over the original host.',
    background: 'The newest online copy is suspect. An offline copy was validated before the incident. Recovery occurs on a clean, separate host. The application must return known restored data after reboot before users can be moved to it.',
    tasks: [
      'Attempt a cutover with the starting configuration and inspect the rejection. Isolate the original host and select the validated offline copy.',
      'Rebuild staging with a reconcile strategy, restore the Portal identity\'s read access and enable the service at boot. Run the known-data and reboot probe.',
      'Request cutover and verify promotion. Save the baseline. Re-run with a blind append or missing boot enablement and confirm promotion is refused even though the data was restored.'
    ],
    reflection: 'What evidence would you retain before deciding to redirect users? Which conditions would make you stop and roll back?',
    boundary: 'The lab demonstrates recovery sequencing and validation. It does not simulate malware, assess whether a real backup is clean, run infrastructure commands or route traffic.',
    reference: ['CISA #StopRansomware Guide', 'https://www.cisa.gov/sites/default/files/2023-10/StopRansomware-Guide-508C-v3_1.pdf'],
    nodes: [['archive', 'Trusted copy'], ['server', 'Staging host'], ['shield-check', 'Cutover gate']],
    fields: [flag('isolate', 'Isolate compromised host'), choice('source', 'Restore source', 'online', [['online','Suspect online copy'],['offline','Validated offline copy']]),
      choice('automation', 'Rebuild strategy', 'append', [['append','Blind append'],['reconcile','Reconcile by exact match']]),
      flag('serviceAccess', 'Portal identity can read restored data'), flag('serviceEnabled', 'Enable Portal at boot'), flag('probe', 'Check known data after reboot'), flag('cutover', 'Request cutover')], run: recoveryCutover
  })]
};
