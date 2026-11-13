import { linuxProjectRubric } from './linux-course-content.js';
import { assessmentPolicy } from './course-catalog.js';
import { linuxAccounts } from './systems-models.js';

const check = (label, ok, detail) => ({ label, ok: Boolean(ok), detail });
const frame = (node, command, output, message) => ({ node, command, output, message });

export function linuxInstallation(config) {
  const safeDisk = config.disk === 'system';
  const booted = safeDisk && config.boot === 'disk';
  const connected = booted && config.network === 'lab';
  const files = booted && config.source === 'reports';
  const report = files && config.log === 'server';
  return {
    events: [
      frame(0, 'lsblk -o NAME,SIZE,TYPE', 'sda   30G disk\nsdb    5G disk', safeDisk
        ? 'The 30 GiB system disk matches the VM plan.' : 'The 5 GiB data disk is reserved for practice. The install check stops the write.'),
      frame(1, 'findmnt -n -o SOURCE,FSTYPE /', booted ? '/dev/sda1 ext4' : 'overlay overlay',
        booted ? 'The VM booted from the installed root.' : 'The installed system disk has not booted. Check the target and boot media.'),
      frame(1, 'ip -br addr', connected ? 'ens18 UP 192.0.2.24/24' : 'ens18 has no assigned lab address',
        connected ? 'The guest has an address on the isolated lab network.' : 'Verify the installed guest and its lab network attachment.'),
      frame(2, 'cmp ~/company/reports/readme.txt ~/company/backups/readme.txt', files ? '[exit 0]' : 'cmp: required report copy is missing',
        files ? 'The report copy matches the source.' : 'The project needs the report under company/reports as the copy source.'),
      frame(2, "grep -F 'ERROR' ~/company/logs/server.log", report ? 'ERROR disk check' : 'The expected log report is absent',
        report ? 'The generated report contains the seeded ERROR line.' : 'Choose the seeded server log and preserve the verified report copy.'),
    ],
    checks: [
      check('Installed root is on the assigned disk', booted, 'Confirm the 30 GiB target and boot the system disk.'),
      check('Lab interface is addressed', connected, 'Attach the guest to the isolated lab network.'),
      check('Department report and error evidence exist', report, 'Use the reports directory and the seeded server.log.'),
    ],
    facts: [['Selected disk', safeDisk ? '30 GiB system disk' : '5 GiB reserved data disk'], ['Boot environment', booted ? 'Installed Ubuntu 24.04 LTS' : 'Installer'], ['Lab interface', connected ? '192.0.2.24/24' : 'No lab address']],
  };
}

export function linuxPackageService(config) {
  const index = config.refresh;
  const installed = index && config.package === 'nginx';
  const terminated = config.pid === 'owned';
  const listening = installed && config.start;
  const response = listening && config.probe === '80';
  const boot = installed && config.enable;
  return {
    events: [
      frame(0, 'sudo apt update', index ? 'Reading package lists... Done' : 'Fixture: trusted package index remains stale',
        index ? 'The repository metadata is available for this run.' : 'Refresh the trusted index before installing the lab package.'),
      frame(0, "dpkg-query -W -f='${Status}\\n' nginx", installed ? 'install ok installed' : 'dpkg-query: no packages found matching nginx',
        installed ? 'The nginx package is installed.' : 'Check the selected package and metadata refresh.'),
      frame(1, 'ps -p ' + (terminated ? '2421' : '2108') + ' -o user,pid,args', terminated ? 'student  2421 sleep 300' : 'root  2108 legacy-listener',
        terminated ? 'The selected PID is the student’s background job.' : 'The selected PID belongs to the neighbor. No signal was sent.'),
      ...(terminated ? [frame(1, 'kill -TERM 2421', '', 'Only the disposable process receives SIGTERM.')] : []),
      frame(2, 'systemctl is-active nginx', listening ? 'active' : installed ? 'inactive' : 'unknown',
        listening ? 'The unit is running.' : 'Check installation and explicitly start the lab unit.'),
      frame(2, 'curl -I --max-time 3 http://127.0.0.1:' + config.probe, response ? 'HTTP/1.1 200 OK\nServer: nginx' : 'No valid nginx response at the selected endpoint',
        response ? 'The client reached the expected local nginx endpoint.' : 'The probe needs the running service on port 80.'),
      frame(2, 'systemctl is-enabled nginx', boot ? 'enabled' : installed ? 'disabled' : 'unknown',
        boot ? 'The service is configured for boot.' : 'Runtime startup and boot enablement are separate.'),
    ],
    checks: [
      check('nginx package verified', installed, 'Refresh the approved repository index and choose nginx.'),
      check('Only the student job was signaled', terminated, 'Verify PID, owner, and command before using SIGTERM.'),
      check('Local HTTP health verified', response, 'Start nginx and check the assigned endpoint on port 80.'),
      check('Boot start verified', boot, 'Enable the installed nginx unit for boot.'),
    ],
    facts: [['Package', installed ? 'nginx installed' : 'nginx absent'], ['Current unit', listening ? 'active' : 'inactive'], ['Boot unit', boot ? 'enabled' : 'not enabled']],
  };
}

export function linuxBackupRestore(config) {
  const mounted = config.label === 'KRYPTLABDATA';
  const sourceTree = mounted && config.source === 'company';
  const cleanArchive = mounted && config.archive === 'verified';
  const checksum = config.verify && cleanArchive;
  const verified = sourceTree && checksum;
  const separate = config.target === 'staging';
  const restored = verified && separate;
  const compared = restored && config.compare;
  return {
    events: [
      frame(0, 'lsblk -o NAME,SIZE,FSTYPE,LABEL,MOUNTPOINTS', 'sda1 30G ext4 SYSTEM /\nsdb   5G ext4 KRYPTLABDATA',
        'Confirm the data volume label and keep the system volume outside the exercise.'),
      frame(0, 'findmnt --mountpoint /mnt/labdata', mounted ? '/mnt/labdata /dev/sdb ext4 rw,relatime' : 'No matching data mount',
        mounted ? 'The expected volume is mounted at the exact target.' : 'The requested label did not identify the approved data disk.'),
      frame(1, 'tar -tzf ~/backups/company.tar.gz', sourceTree ? 'company/\ncompany/reports/readme.txt' : 'Required company/reports/readme.txt is absent',
        sourceTree ? 'The archive contains the project’s required file.' : 'Verify the mounted source and archive membership.'),
      frame(1, '(cd ~/backups && sha256sum -c company.tar.gz.sha256)', checksum ? 'company.tar.gz: OK' : config.verify ? 'company.tar.gz: FAILED or unavailable' : 'Checksum verification skipped',
        checksum ? 'Archive bytes match the trusted checksum.' : 'Restore is gated on a verified checksum.'),
      frame(2, 'tar -xzf ~/backups/company.tar.gz -C ~/restore-test', restored ? '[extraction complete]' : 'Extraction withheld',
        separate ? (restored ? 'Data was extracted into a clean target.' : 'The restore requires both the verified archive and the requested dataset.') : 'The requested restore would overwrite the source. No files were changed.'),
      frame(2, 'diff -r ~/company ~/restore-test/company', compared ? '[no differences; exit 0]' : 'No verified content comparison',
        compared ? 'The recovered tree matches the required data.' : 'Run the comparison after a safe, verified extraction.'),
    ],
    checks: [
      check('Approved volume mounted', mounted, 'Select the exact label KRYPTLABDATA.'),
      check('Expected archive and checksum verified', verified, 'Require the company tree and compare a clean archive with its trusted checksum.'),
      check('Restore verified in a separate target', compared, 'Use the isolated restore directory and compare the recovered files.'),
    ],
    facts: [['Source files', 'Preserved'], ['Restore destination', restored ? '~/restore-test/company' : 'No restore performed'], ['Content comparison', compared ? 'Match' : 'Unverified']],
  };
}

export function linuxMaintenance(config) {
  const inspected = config.measure === 'disk';
  const archived = config.cleanup === 'archive';
  const free = archived ? '2.1G' : '0';
  const recovered = archived && config.restart;
  const verified = recovered && config.probes === 'both';
  return {
    events: [
      frame(0, 'systemctl --failed', 'nginx.service loaded failed failed', 'The health baseline shows nginx failed. Inspect its current log and the affected filesystem.'),
      frame(0, 'sudo journalctl -u nginx -b -n 20 --no-pager', 'open() "/var/log/nginx/error.log" failed (28: No space left on device)', 'This fixture is out of blocks on the filesystem holding the logs. Confirm the resource before changing it.'),
      inspected
        ? frame(1, 'df -h /var/log; sudo du -sh /var/log/nginx/archive', '/dev/sda1  30G  30G  0  100% /\n2.1G  /var/log/nginx/archive', 'The assigned archive directory contains closed logs and is large enough to release space. Keep the active log and preserve the required archive.')
        : frame(1, 'free -h', 'Mem: 3.8Gi total, 3.2Gi available', 'Available RAM does not explain a full filesystem. Check the log path with df and identify candidates with du.'),
      frame(1, 'df -h /var/log', 'Available: ' + free, archived
        ? 'A verified copy of the closed archive is retained on a separate approved volume and the old copy was removed.'
        : 'The fixture does not remove active logs or unverified copies. The original evidence stays in place.'),
      frame(2, 'systemctl is-active nginx', recovered ? 'active' : 'failed',
        recovered ? 'The unit is running after capacity was restored.' : 'Restore sufficient space and start the unit.'),
      frame(2, 'curl -fsS http://127.0.0.1/health', recovered ? 'kryptnet nginx lab ready' : 'No valid nginx response',
        verified ? 'The application and the independent neighboring service probes both match their baselines.' : 'Record the exact application response and verify the neighbor separately.'),
      ...(config.probes === 'both'
        ? [frame(2, 'curl -fsS http://127.0.0.1:8080/health', 'legacy service ready', 'The unrelated listener still returns its expected response.')]
        : []),
    ],
    checks: [
      check('Filesystem exhaustion confirmed', inspected, 'Use the nginx journal, df and du on the log filesystem.'),
      check('Capacity restored with archived evidence', archived, 'Verify the closed log copy on the designated volume before removing the original copy.'),
      check('Application and neighbor verified', verified, 'Start nginx and confirm both application-specific responses.'),
    ],
    facts: [['Free space after change', free], ['Closed log copy retained', archived ? 'On approved separate volume' : 'At original location'], ['Active log', 'Preserved']],
  };
}

const handoverFaults = {
  socket: {
    log: 'bind() to 127.0.0.1:80 failed (98: Address already in use)',
    command: 'sudo ss -ltnp', output: 'LISTEN 0 128 127.0.0.1:80 0.0.0.0:* users:(("legacy",pid=2108,fd=3))',
    evidence: 'sockets', repair: 'port', port: '8081', rollback: 'site',
  },
  permissions: {
    log: 'open() /srv/nginx-lab/index.html failed (13: Permission denied)',
    command: 'namei -l /srv/nginx-lab/index.html', output: 'drwx------ root root nginx-lab\n-rw-r----- root www-data index.html',
    evidence: 'path', repair: 'access', port: '80', rollback: 'permissions',
  },
};

export function linuxHandover(config) {
  const fault = handoverFaults[config.fault] || handoverFaults.socket;
  const inspected = config.baseline === 'health';
  const team = linuxAccounts({
    group: 'supportlab', operator: 'laboperator', analyst: 'labanalyst', addOperator: true, addAnalyst: true,
    addGuest: false, ownerGroup: 'team', mode: config.team, fresh: true,
  });
  const access = team.checks.every(item => item.ok);
  const repaired = config.repair === fault.repair;
  const deployed = repaired && config.service === 'enable';
  const live = repaired && config.service !== 'none';
  const restoration = linuxBackupRestore({
    label: 'KRYPTLABDATA', source: 'company', archive: 'verified',
    verify: config.restore === 'compare', target: config.restore === 'overwrite' ? 'source' : 'staging',
    compare: config.restore === 'compare',
  });
  const backup = restoration.checks.every(item => item.ok);
  const diagnosed = config.evidence === fault.evidence;
  const documented = config.report === 'complete' && config.rollback === fault.rollback;
  const safe = config.repair !== 'disable-neighbor' && config.repair !== 'world-write' && config.restore !== 'overwrite';
  const required = [
    check('Environment (10)', inspected, 'Record a baseline of uptime, memory, disk, failed units, and warnings.'),
    check('Users and permissions (20)', access, 'Require the team group, setgid inheritance, and a denied guest probe.'),
    check('Service deployment (20)', deployed, 'Verify the intended HTTP response before and after reboot.'),
    check('Backup and restore (20)', backup, 'Verify the backup and compare data restored to a separate target.'),
    check('Troubleshooting (20)', diagnosed && repaired, 'Use the relevant diagnostic evidence and select the smallest repair.'),
    check('Documentation and safety (10)', documented && safe, 'Retain evidence, change, verification and rollback while preserving the original data and neighboring service.'),
  ];
  const score = required.reduce((sum, item, index) => sum + (item.ok ? linuxProjectRubric[index][1] : 0), 0);
  const critical = access && deployed && backup && safe;
  const passed = score >= assessmentPolicy.passMark && critical;
  const evidenceFrame = diagnosed ? frame(2, fault.command, fault.output, 'This output supports the cause reported by the journal.')
    : frame(2, 'uptime', 'up 2 days, load average: 0.08, 0.12, 0.10', 'The selected evidence does not establish the fault. Compare the journal with a relevant socket or path inspection.');
  return {
    passed,
    events: [
      frame(0, 'systemctl --failed', inspected ? 'nginx.service loaded failed failed' : 'Health baseline not recorded',
        inspected ? 'The pre-change report records the failing unit and system resources.' : 'Collect a baseline before making a change.'),
      frame(1, 'stat -c "%U %G %a" /srv/supportlab', access ? 'root supportlab 2770' : 'root supportlab ' + config.team,
        access ? 'Both staff probes pass, guest access is denied, and a new file inherits the group.' :
          team.checks.filter(item => !item.ok).map(item => item.label + ' needs attention.').join(' ')),
      frame(2, 'sudo journalctl -u nginx -b -n 20 --no-pager', fault.log, 'Use this symptom to select a supporting diagnostic.'),
      evidenceFrame,
      frame(2, 'curl -fsS --max-time 3 http://127.0.0.1:' + fault.port + '/health', live ? 'kryptnet nginx lab ready' : 'No valid nginx response',
        deployed ? 'The repaired service returns the expected content now and after a simulated reboot.' : 'The required response was not verified both now and after boot.'),
      frame(2, 'curl -fsS --max-time 3 http://127.0.0.1:' + (config.fault === 'permissions' ? '8080' : '80') + '/health', config.repair === 'disable-neighbor' ? 'No valid neighbor response' : 'legacy service ready',
        'Check the neighboring endpoint separately from the repaired nginx application.'),
      frame(3, 'diff -r ~/company ~/restore-test/company', backup ? '[no differences; exit 0]' : 'A safe, matching restore has not been verified',
        backup ? 'The verified archive was restored separately and the content matches.' : 'A backup must be restored and compared before signing off.'),
    ],
    checks: [...required, check('Project pass gate', passed, 'Score at least ' + assessmentPolicy.passMark + '% and pass all critical checks for access, service, restore, and safety.')],
    facts: [['Practice score', score + '%'], ['Critical checks', critical ? 'Passed' : 'Incomplete'], ['Change record', documented ? 'Symptoms, evidence, change, verification, rollback' : 'Incomplete']],
  };
}
