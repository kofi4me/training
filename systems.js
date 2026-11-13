import './account-nav.js';
import { courseForLocation, courseLabels } from './course-catalog.js';
import { mountLabWorkbench } from './lab-workbench.js';
import { systemsLabs } from './systems-labs.js';

const lessons = {
  linux: {
    intro: 'Provision local Linux accounts, reason about effective permissions, and restore a systemd service without weakening access controls.',
    sections: [
      `<h2>Accounts, groups and process credentials</h2>
      <p>A user account maps a login name to a numeric UID and a primary group ID (GID). A group is a named identity to which access can be granted. A private primary group can keep one user's files separate; supplementary groups grant team access without replacing that primary group. Linux checks the credentials of the process making a request, not just the current contents of the account database.</p>
      <p>On a host using local accounts, <code>getent passwd</code> and <code>getent group</code> look up identities. A named <code>id</code> query looks up an account; <code>id</code> with no username reports the current process identity and group list. Existing sessions do not acquire new supplementary groups automatically. Re-test with a new session before concluding that an access rule failed.</p>
      <details class="lab-checkpoint"><summary>Worked Linux commands for a disposable VM</summary>
      <p>Use a snapshot of an isolated Linux VM with shadow utilities and sudo. Confirm the example users, group and directory do not already exist. These commands change the VM; do not run them on the KryptNet server. Authentication credentials are not needed for the administrator-run identity probes.</p>
      <pre><code>sudo groupadd supportlab
sudo useradd -m -U laboperator
sudo useradd -m -U labanalyst
sudo useradd -m -U labguest
sudo usermod -aG supportlab laboperator
sudo usermod -aG supportlab labanalyst
sudo install -d -o root -g supportlab -m 2770 /srv/supportlab
getent group supportlab
sudo -u laboperator -- id
sudo -u laboperator -- touch /srv/supportlab/example.txt
sudo -u labanalyst -- test -w /srv/supportlab
stat -c '%U %G %a' /srv/supportlab/example.txt
sudo -u labguest -- test -x /srv/supportlab
echo "$?"</code></pre>
      <p>The last probe should return 1. The sample file should belong to <code>supportlab</code>. The <code>-a</code> in <code>usermod -aG</code> appends membership; omitting it can replace existing supplementary groups. Reset the VM snapshot when finished.</p>
      <p>References: <a href="https://man7.org/linux/man-pages/man8/groupadd.8.html">groupadd(8)</a>, <a href="https://man7.org/linux/man-pages/man8/useradd.8.html">useradd(8)</a>, <a href="https://man7.org/linux/man-pages/man8/usermod.8.html">usermod(8)</a>.</p></details>`,
      `<h2>Ownership, octal modes and path traversal</h2>
      <p>In a permission digit, read is 4, write is 2, and execute or search is 1. <code>0640</code> gives the owner read and write, the group read, and others no access. For a directory, read lists names, search looks up a known name, and write combined with search can create or remove directory entries. Access to a file also requires search permission on its parent directories.</p>
      <p>In <code>2770</code>, the leading <code>2</code> sets set-group-ID. In this directory, new entries inherit the directory group; their own mode bits still depend on how they are created. A read-only file can still be replaced by a user who can write and search its parent directory, unless another control such as a sticky directory rule prevents that operation.</p>
      <details class="lab-checkpoint"><summary>Knowledge check: 0740 or 0710?</summary><p><strong>Question:</strong> Which mode lets a group member open a known filename without granting permission to list the directory?</p><p><strong>Answer:</strong> 0710 grants group search but not directory read. The file itself must also allow the requested operation. 0740 allows listing names but lacks search.</p></details>`,
      `<h2>Service lifecycle and fault isolation</h2>
      <p>A service definition describes the executable, runtime identity and dependencies. Starting a unit activates it now; enabling it configures boot activation in the unit's supported target. Neither proves that the application answers a valid request. Test the expected application response and repeat after a simulated reboot.</p>
      <p>On a systemd VM, inspect <code>systemctl status portal.service</code> and <code>journalctl -u portal.service -b</code> before changing permissions or ports. Use <code>ss -ltn</code> to check listening TCP sockets. A permissions failure can hide the next fault; once the service reads its configuration, the journal may expose an address already in use. Repair the lowest demonstrated failing dependency, then rerun the same probe.</p>
      <details class="lab-checkpoint"><summary>Knowledge check: service active, client fails</summary><p><strong>Question:</strong> Portal is active on 8081, but the client still calls 8080. What should you verify before restarting it?</p><p><strong>Answer:</strong> Verify the client's destination and an application-specific response on 8081. A response on 8080 might come from the legacy listener.</p></details>`
    ]
  },
  automation: {
    intro: 'Write and inspect Bash and Python examples, then test how input validation, repeatability and scheduling affect a service operation.',
    sections: [
      `<h2>Inputs, outputs and exit status</h2>
      <p>Automation needs a contract: the expected input format, the result sent to standard output, diagnostics sent to standard error, and an exit status the caller can act on. Quote shell variables so one value remains one argument. Check the exit status at the point of failure rather than reading it after another command has overwritten it.</p>
      <details class="lab-checkpoint"><summary>Worked Bash example: service health check</summary><p>In a disposable systemd VM, replace the fixed unit name with one you can safely inspect. This script checks unit activity, not HTTP health.</p>
      <pre><code>#!/usr/bin/env bash
unit=portal.service
if systemctl is-active --quiet "$unit"; then
    printf '%s is active\\n' "$unit"
else
    status=$?
    printf '%s is not active (status %s)\\n' "$unit" "$status" &gt;&amp;2
    exit "$status"
fi</code></pre></details>
      <details class="lab-checkpoint"><summary>Worked Python example: count and validate log records</summary><p>Save or type this fixture example in a disposable Python environment. Change the threshold to 3, then predict the exit status before rerunning. For a real CSV file, pass the opened file to <code>csv.reader</code> with <code>newline=''</code>.</p>
      <pre><code>import csv
import sys

rows = ["portal,INFO", "portal,ERROR", "backup,ERROR",
        "portal,ERROR", "portal,WARN", "portal,UNKNOWN"]
errors = rejected = 0
for row in csv.reader(rows):
    if len(row) != 2 or row[1] not in {"INFO", "WARN", "ERROR"}:
        rejected += 1
        continue
    if row == ["portal", "ERROR"]:
        errors += 1

print(f"portal errors={errors}, rejected={rejected}")
sys.exit(1 if errors &gt;= 2 else 0)</code></pre></details>`,
      `<h2>Dry runs, validation and idempotence</h2>
      <p>Separate discovery, validation, planning and application. A dry run describes the proposed changes without committing them. An idempotent operation converges on the same intended state when repeated with the same input: adding a missing entry once is safe to repeat; appending a new copy on every run is not.</p>
      <p>For a line-based inventory, exact equality matters. Checking whether a line contains <code>reports</code> could also match <code>old-reports</code>. In Bash, <code>grep -Fx -- "$entry" "$inventory"</code> checks whole literal lines. Distinguish its no-match status from an input or I/O failure before writing. A check followed by a write is not sufficient for concurrent jobs unless coordinated.</p>
      <details class="lab-checkpoint"><summary>Knowledge check: retrying a change</summary><p><strong>Question:</strong> A dry run made no changes. Does that prove the apply operation is idempotent?</p><p><strong>Answer:</strong> No. Test a successful apply twice and compare state and write counts. Then test invalid input separately.</p></details>`,
      `<h2>Scheduling, locking and publishing</h2>
      <p>Set an explicit working directory, runtime identity and input paths. A second scheduled invocation can start while the first is still running. Mutual exclusion coordinates writers; it does not make a writer's output valid. Stage output separately, validate it, then replace the destination on the same filesystem. The consumer should keep seeing the prior complete result if validation fails.</p>
      <p>Return a nonzero status to the scheduler on failure. Do not let a successful logging command hide a failed writer. A lock handles concurrency, atomic replacement handles publication visibility, and failure propagation handles detection. Each needs its own test.</p>
      <details class="lab-checkpoint"><summary>Knowledge check: a healthy-looking report</summary><p><strong>Question:</strong> The previous report is still readable after a failed run. Can the scheduler infer that the latest run succeeded?</p><p><strong>Answer:</strong> No. The report and the job outcome measure different things. Check the exit status and report age.</p></details>`
    ]
  },
  recovery: {
    intro: 'Translate recovery objectives into a backup plan, verify a damaged backup chain, and bring a service back through a controlled cutover.',
    sections: [
      `<h2>Recovery point and recovery time objectives</h2>
      <p>The recovery point objective (RPO) sets the tolerable data-loss window. Measure the simulated data-loss interval from the incident back to the newest usable recovery point. The recovery time objective (RTO) sets a target for restoring the required service. Count preparation, copy, application startup and validation, not just the time spent transferring bytes.</p>
      <p><strong>Worked example:</strong> An incident occurs at 10:20. The 10:15 copy failed verification, so the usable point is 10:00. The data-loss window is 20 minutes. If preparation takes 8 minutes, copying 15 and validation 10, recovery takes 33 minutes. A 25-minute RPO and 45-minute RTO are both met in that run, even though a scheduled copy failed.</p>
      <details class="lab-checkpoint"><summary>Knowledge check: schedule versus measured result</summary><p><strong>Question:</strong> A job is scheduled every 15 minutes. Is the recoverable data guaranteed to be no older than 15 minutes?</p><p><strong>Answer:</strong> No. Failed, incomplete or unusable points can widen the recovery gap. Test which copies you can actually restore.</p></details>`,
      `<h2>Full, incremental and differential backups</h2>
      <p>A full backup copies the selected dataset. An incremental backup records changes relative to a preceding backup; a linear chain requires the base and every needed increment. A differential backup is relative to a full backup, so that format generally needs the base plus the selected differential. Always check the actual dependency manifest for the format you use.</p>
      <p>A manifest hash can detect unexpected bytes against a trusted expectation. It does not prove application consistency or that the manifest itself is trustworthy. Verify objects, restore to an isolated target, and then test representative application data and dependencies. Keep the source and live environment untouched during this drill.</p>
      <details class="lab-checkpoint"><summary>Knowledge check: missing middle increment</summary><p><strong>Question:</strong> The latest incremental object verifies, but an earlier required object is corrupt. Can you claim the latest recovery point?</p><p><strong>Answer:</strong> No. Recover the missing dependency from a trusted copy or choose an earlier intact point and recalculate data loss.</p></details>`,
      `<h2>Isolated recovery and cutover</h2>
      <p>After suspected compromise, isolate the affected environment and identify a trusted recovery point. Keep an offline or otherwise protected copy, restrict recovery credentials, and test a restore before assuming data is usable. Rebuild in a clean environment, verify service identity permissions, and check a known record through the application after restart.</p>
      <p>Define cutover criteria and rollback triggers before directing users to the recovered service. A successful file copy is not proof that the service can read it or start at boot. In the capstone, reconcile the configuration twice, verify service access, and require an application check before promotion.</p>
      <details class="lab-checkpoint"><summary>Knowledge check: authorization to promote</summary><p><strong>Question:</strong> The restore succeeded, but the application does not start after reboot. Should you redirect users?</p><p><strong>Answer:</strong> No. Recheck service activation and dependencies, then validate the application response before promotion.</p></details>`
    ]
  }
};

const content = document.querySelector('#systems-content');
const id = courseForLocation(location.pathname, location.search) || 'linux';
const course = lessons[id];
const title = courseLabels[id];
document.title = `${title} | KryptNet`;
document.querySelector('#training-title').textContent = title;
document.querySelector('#systems-intro').textContent = course.intro;
document.querySelector(`[data-course="${id}"]`).setAttribute('aria-current', 'page');

for (const [index, definition] of systemsLabs[id].entries()) {
  const lesson = document.createElement('section');
  lesson.className = 'systems-lesson';
  lesson.innerHTML = course.sections[index];
  content.append(lesson);
  mountLabWorkbench(content, definition);
  const link = document.createElement('a');
  link.href = `#${definition.id}`;
  link.textContent = `Lab ${index + 1}: ${definition.level}`;
  document.querySelector('#systems-jumps').append(link);
}
