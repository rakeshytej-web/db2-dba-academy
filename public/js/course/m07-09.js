(function () {
  const C = (typeof window !== 'undefined' ? window : global).COURSE; const R = C.res;
  const SHOP = ['db2start', 'db2 create database shop', 'db2 connect to shop'];
  const SHOP_ARCH = ['db2start', 'mkdir -p /db2backup /db2archive', 'db2 create database shop', 'db2 update db cfg for shop using logarchmeth1 disk:/db2archive', 'db2 backup database shop to /db2backup', 'db2 connect to shop', 'db2 "create table orders (id int not null primary key, item varchar(20))"', 'db2 "insert into orders values (1,\'pen\'),(2,\'book\')"', 'db2 connect reset', 'db2 backup database shop to /db2backup', 'db2 connect to shop'];

  /* ===================== MODULE 7 ===================== */
  C.add({
    n: 7, id: 'm7', icon: '🔐', title: 'Security: Authorities, Privileges & Roles', minutes: 75,
    summary: 'How Db2 authenticates users, the authority hierarchy, granting and revoking privileges, roles, and a tour of advanced controls such as RCAC and encryption.',
    objectives: ['Explain authentication vs. authorization', 'Name the instance-level and database-level authorities', 'GRANT and REVOKE database and object privileges', 'Use roles and views to implement least privilege', 'Audit who can do what from the catalog'],
    lessons: [
      {
        id: 'l1', title: 'Authentication and authorities', html: `
<p><b>Authentication</b> answers “who are you?”. Db2 does <i>not</i> store passwords: it relies on the operating system, LDAP, Kerberos or a plug-in (<code>AUTHENTICATION</code> in the DBM CFG). <b>Authorization</b> answers “what may you do?” and is stored inside the database.</p>
<h4>Instance-level authorities (granted via OS groups in the DBM CFG)</h4>
<table><tr><th>Authority</th><th>Config parameter</th><th>Can…</th></tr>
<tr><td><b>SYSADM</b></td><td><code>SYSADM_GROUP</code></td><td>Manage the instance, all databases, create/drop DBs, update configuration; <i>no automatic data access</i> in current releases</td></tr>
<tr><td><b>SYSCTRL</b></td><td><code>SYSCTRL_GROUP</code></td><td>System control without data access (create/drop databases, force applications)</td></tr>
<tr><td><b>SYSMAINT</b></td><td><code>SYSMAINT_GROUP</code></td><td>Maintenance (backup, restore, runstats) without data access</td></tr>
<tr><td><b>SYSMON</b></td><td><code>SYSMON_GROUP</code></td><td>Monitoring only</td></tr></table>
<h4>Database-level authorities (granted inside a database)</h4>
<table><tr><th>Authority</th><th>Purpose</th></tr>
<tr><td><b>SECADM</b></td><td>Security administrator: create roles, grant authorities, manage audit &amp; RCAC</td></tr>
<tr><td><b>DBADM</b></td><td>Administer the database objects (can be granted without data access: <code>WITHOUT DATAACCESS</code>)</td></tr>
<tr><td><b>DATAACCESS</b></td><td>Read/write all data</td></tr>
<tr><td><b>ACCESSCTRL</b></td><td>Grant/revoke object privileges</td></tr>
<tr><td><b>SQLADM / WLMADM / EXPLAIN</b></td><td>Tuning, workload management, explain without data access</td></tr>
<tr><td><b>LOAD</b></td><td>Run the LOAD utility</td></tr>
<tr><td><b>CONNECT, CREATETAB, BINDADD, IMPLICIT_SCHEMA</b></td><td>Basic database privileges (granted to PUBLIC by default unless <code>RESTRICTIVE</code>)</td></tr></table>
<div class="callout tip"><b>Separation of duties:</b> modern Db2 lets you split security administration (SECADM), data administration (DBADM) and data access (DATAACCESS). Grant the smallest authority that does the job.</div>` },
      {
        id: 'l2', title: 'Privileges, GRANT/REVOKE and roles', html: `
<pre class="code">db2 grant connect on database to user alice
db2 grant select on table emp to user alice
db2 grant select, insert, update on table emp to role hr_clerk
db2 grant all on table emp to user bob with grant option
db2 revoke insert on table emp from user alice
db2 revoke connect on database from public</pre>
<h4>Object privileges on tables</h4>
<p><code>SELECT, INSERT, UPDATE, DELETE, ALTER, INDEX, REFERENCES</code>, and <code>CONTROL</code> (all of them plus the right to grant them). The <b>owner</b> of an object has CONTROL implicitly.</p>
<h4>Roles – the right way to scale security</h4>
<p>A <b>role</b> is a named bundle of privileges. Grant privileges to roles, then grant roles to users. When an employee changes job you change one role membership instead of dozens of grants.</p>
<pre class="code">db2 create role analyst
db2 grant select on table emp to role analyst
db2 grant analyst to user alice
db2 revoke analyst from user alice</pre>
<h4>Views as a security layer</h4>
<pre class="code">db2 "create view emp_public as select id, name from emp"
db2 grant select on table emp_public to role analyst</pre>
<p>Users can read the view without any privilege on the base table – a simple column-level filter.</p>
<h4>Auditing privileges from the catalog</h4>
<pre class="code">db2 "select grantee, granteetype, connectauth, dbadmauth from syscat.dbauth"
db2 "select grantee, tabname, selectauth, insertauth from syscat.tabauth where tabschema = 'DB2INST1'"
db2 "select * from syscat.roleauth"</pre>
<div class="callout warn"><b>PUBLIC</b> is a special group that means <i>everyone</i>. Revoke unnecessary privileges from PUBLIC (for example CONNECT) in security-sensitive databases or create them with <code>RESTRICTIVE</code>.</div>
<p>Errors you will see: <code>SQL0551N</code> (missing privilege on an object), <code>SQL0552N</code> (missing authority), <code>SQL1060N</code> (no CONNECT privilege), <code>SQL1403N</code> (bad user/password).</p>` },
      {
        id: 'l3', title: 'Advanced protection (concepts)', html: `
<table><tr><th>Feature</th><th>What it does</th></tr>
<tr><td><b>RCAC</b> – row permissions &amp; column masks</td><td>Rules the engine enforces for <i>every</i> access path (e.g. a manager only sees their department's rows; credit card shown as XXXX-1234). Managed by SECADM.</td></tr>
<tr><td><b>LBAC</b> – label-based access control</td><td>Security labels on rows/columns compared with user labels; for classified data.</td></tr>
<tr><td><b>Native encryption</b></td><td>Encrypt the database, backups and logs at rest (<code>CREATE DATABASE … ENCRYPT</code>), keys in a keystore.</td></tr>
<tr><td><b>TLS / SSL</b></td><td>Encrypt data in transit: <code>DB2COMM=TCPIP,SSL</code> and a server certificate.</td></tr>
<tr><td><b>Audit facility</b> (<code>db2audit</code>)</td><td>Records authorization failures, privilege changes, executed SQL for compliance.</td></tr>
<tr><td><b>Trusted contexts</b></td><td>Allow a middle-tier application to switch user identity safely.</td></tr></table>
<h4>Hardening checklist</h4>
<ul><li>Use <code>AUTHENTICATION SERVER_ENCRYPT</code> or stronger; enable TLS.</li><li>Run applications under dedicated IDs; never share the instance owner account.</li><li>Revoke PUBLIC privileges you do not need.</li><li>Use roles; review <code>SYSCAT.DBAUTH</code>/<code>TABAUTH</code> regularly.</li><li>Encrypt backups; protect the keystore.</li><li>Enable auditing for privileged users.</li></ul>` }
    ],
    labs: [{
      id: 'lab1', title: 'Lab 7.1 – Role-based access', level: 'Intermediate', terminals: 1,
      goal: 'Lock the database down, then give an analyst read-only access and an HR clerk read/write access using roles.',
      setup: [...SHOP, 'db2 "create table emp (id int not null primary key, name varchar(30), salary int)"', 'db2 "insert into emp values (1,\'Alice\',5000),(2,\'Bob\',6000)"'],
      steps: [
        { t: 'Create operating-system users for the people involved (Db2 relies on the OS for identities).', cmd: 'useradd alice\nuseradd bob\nuseradd carol' },
        { t: 'Create two roles and give them privileges on EMP.', cmd: 'db2 create role analyst\ndb2 create role hr_clerk\ndb2 grant select on table emp to role analyst\ndb2 grant select, insert, update on table emp to role hr_clerk' },
        { t: 'Lock down CONNECT: revoke it from PUBLIC, then grant it to alice and bob only. Assign the roles.', cmd: 'db2 revoke connect on database from public\ndb2 grant connect on database to user alice\ndb2 grant connect on database to user bob\ndb2 grant analyst to user alice\ndb2 grant hr_clerk to user bob' },
        { t: 'Test as <b>alice</b>: SELECT works, INSERT must fail with SQL0551N.', cmd: 'db2 connect reset\ndb2 connect to shop user alice using Passw0rd\ndb2 "select * from emp"\ndb2 "insert into emp values (3,\'Cy\',1)"\ndb2 connect reset' },
        { t: 'Test as <b>bob</b>: UPDATE works, DELETE must fail.', cmd: 'db2 connect to shop user bob using Passw0rd\ndb2 "update emp set salary = salary + 100 where id = 1"\ndb2 "delete from emp where id = 2"\ndb2 connect reset' },
        { t: 'Try <b>carol</b> (no CONNECT privilege → SQL1060N), then reconnect as the instance owner and audit role membership.', cmd: 'db2 connect to shop user carol using Passw0rd\ndb2 connect to shop\ndb2 "select * from syscat.roleauth"' }
      ],
      hints: ['Remember: connect reset before connecting as another user.', 'Roles are granted to users with: grant <role> to user <name>.'],
      checks: [
        { d: 'Roles ANALYST and HR_CLERK exist', f: (S) => S.db('SHOP').roles.ANALYST && S.db('SHOP').roles.HR_CLERK },
        { d: 'PUBLIC no longer has CONNECT', f: (S) => !S.db('SHOP').auth.some((a) => a.grantee === 'PUBLIC' && a.priv === 'CONNECT') },
        { d: 'alice has ANALYST, bob has HR_CLERK', f: (S) => S.db('SHOP').roles.ANALYST.members.includes('ALICE') && S.db('SHOP').roles.HR_CLERK.members.includes('BOB') },
        { d: 'ANALYST can SELECT on EMP', f: (S) => S.db('SHOP').tabauth.some((a) => a.table === 'EMP' && a.grantee === 'ANALYST' && a.priv === 'SELECT') },
        { d: 'You saw SQL0551N (missing privilege)', f: (S) => S.failed('SQL0551N') },
        { d: 'You saw SQL1060N (no CONNECT privilege)', f: (S) => S.failed('SQL1060N') }
      ],
      solution: ['useradd alice', 'useradd bob', 'useradd carol', 'db2 create role analyst', 'db2 create role hr_clerk', 'db2 grant select on table emp to role analyst', 'db2 grant select, insert, update on table emp to role hr_clerk', 'db2 revoke connect on database from public', 'db2 grant connect on database to user alice', 'db2 grant connect on database to user bob', 'db2 grant analyst to user alice', 'db2 grant hr_clerk to user bob', 'db2 connect reset', 'db2 connect to shop user alice using Passw0rd', 'db2 "select * from emp"', 'db2 "insert into emp values (3,\'Cy\',1)"', 'db2 connect reset', 'db2 connect to shop user bob using Passw0rd', 'db2 "update emp set salary = salary + 100 where id = 1"', 'db2 "delete from emp where id = 2"', 'db2 connect reset', 'db2 connect to shop user carol using Passw0rd', 'db2 connect to shop', 'db2 "select * from syscat.roleauth"']
    }],
    quiz: [
      { q: 'Where does Db2 verify passwords by default (AUTHENTICATION SERVER)?', o: ['Inside the database catalog', 'On the server operating system', 'In db2diag.log', 'In the registry'], a: 1, why: 'Db2 relies on external security (OS, LDAP, Kerberos) for authentication.' },
      { q: 'Which authority lets you create roles and grant authorities?', o: ['SYSMON', 'SECADM', 'LOAD', 'SQLADM'], a: 1, why: 'SECADM is the security administrator.' },
      { q: 'Error SQL0551N means…', o: ['Wrong password', 'Missing privilege on an object', 'Table space full', 'Deadlock'], a: 1, why: 'The authorization ID lacks the required privilege on the object.' },
      { q: 'What is the main advantage of roles?', o: ['They encrypt data', 'You manage privileges once per job function instead of per user', 'They speed up queries', 'They are required to connect'], a: 1, why: 'Grant to the role; change membership when people change jobs.' },
      { q: 'Which statement removes the default ability of every user to connect?', o: ['revoke connect on database from public', 'grant connect to nobody', 'drop role public', 'update dbm cfg using authentication none'], a: 0, why: 'PUBLIC represents all users.' },
      { q: 'Which feature masks a column value (e.g. shows only the last 4 digits) for certain users?', o: ['RCAC column mask', 'Index', 'Table space', 'REORG'], a: 0, why: 'Row permissions and column masks are RCAC rules managed by SECADM.' }
    ],
    resources: [R.docs, { title: 'Look up: Authorities overview', url: C.search('authorities overview'), note: 'Complete table of what each authority allows.' }, { title: 'Look up: Row and column access control (RCAC)', url: C.search('row and column access control RCAC'), note: 'Row permissions and column masks.' }, { title: 'Look up: Db2 native encryption', url: C.search('native encryption'), note: 'Encrypting databases and backups.' }]
  });

  /* ===================== MODULE 8 ===================== */
  C.add({
    n: 8, id: 'm8', icon: '📝', title: 'Transaction Logging & Backup', minutes: 90,
    summary: 'How the transaction log works, circular vs. archive logging, and how to take full, online, incremental and table-space backups.',
    objectives: ['Explain write-ahead logging, commit and rollback', 'Configure archive logging and understand BACKUP PENDING', 'Take offline, online, incremental and table-space backups', 'Read the recovery history file and verify backup images'],
    lessons: [
      {
        id: 'l1', title: 'How transaction logging works', html: `
<p>Every INSERT/UPDATE/DELETE is described in the <b>transaction log</b> before it is considered committed. Pages in the buffer pool may be written later by page cleaners – the log makes that safe.</p>
<ul><li><b>COMMIT</b> – the log buffer is forced to disk; the work is durable.</li><li><b>ROLLBACK</b> – changes are undone using the log.</li><li><b>Crash recovery</b> – after a power loss Db2 automatically redoes committed and undoes uncommitted work at the next connection/activation (<code>RESTART DATABASE</code>).</li></ul>
<h4>Two logging modes</h4>
<table><tr><th></th><th>Circular logging</th><th>Archive logging</th></tr>
<tr><td><code>LOGARCHMETH1</code></td><td><code>OFF</code> (default)</td><td><code>DISK:/path</code>, <code>TSM</code>, <code>VENDOR</code>, <code>LOGRETAIN</code></td></tr>
<tr><td>Log files reused?</td><td>Yes – overwritten in a ring</td><td>No – full logs are archived and kept</td></tr>
<tr><td>Recovery possible</td><td>Restore to the backup time only (<b>version recovery</b>)</td><td>Restore + <b>rollforward</b> to end of logs or any point in time</td></tr>
<tr><td>Online backup</td><td>No</td><td>Yes</td></tr>
<tr><td>Use for</td><td>Dev/test</td><td><b>All production databases</b></td></tr></table>
<h4>Log types and configuration</h4>
<table><tr><th>Parameter</th><th>Meaning</th></tr>
<tr><td><code>LOGFILSIZ</code></td><td>Size of each log file (4 KB pages)</td></tr>
<tr><td><code>LOGPRIMARY</code> / <code>LOGSECOND</code></td><td>Preallocated / on-demand extra log files. Active log space = (primary+secondary) × size. If exhausted: <code>SQL0964C The transaction log for the database is full</code>.</td></tr>
<tr><td><code>NEWLOGPATH</code> / <code>MIRRORLOGPATH</code></td><td>Put logs on separate fast disks; mirror them on a different disk.</td></tr>
<tr><td><code>LOGARCHMETH1/2</code></td><td>Primary/secondary archive destinations.</td></tr>
<tr><td><code>BLK_LOG_DSK_FUL</code></td><td>Wait instead of failing when the log disk is full.</td></tr></table>
<p>States of a log file: <b>active</b> (needed for crash recovery), <b>online archive</b> (full, still in the log path), <b>offline archive</b> (moved to the archive location).</p>
<div class="callout warn">Switching a database from circular to archive logging (or back) puts it in <b>BACKUP PENDING</b>: nobody can connect until a full <i>offline</i> backup is taken (<code>SQL1116N</code>).</div>` },
      {
        id: 'l2', title: 'Backup types and commands', html: `
<pre class="code">db2 backup database sample to /db2backup
db2 backup database sample online to /db2backup compress
db2 backup database sample online include logs to /db2backup
db2 backup database sample online incremental to /db2backup
db2 backup database sample online incremental delta to /db2backup
db2 backup database sample tablespace (userspace1) online to /db2backup</pre>
<table><tr><th>Type</th><th>Requires</th><th>Contains</th></tr>
<tr><td><b>Offline full</b></td><td>No connections (not activated)</td><td>Whole database</td></tr>
<tr><td><b>Online full</b></td><td>Archive logging (else <code>SQL2413N</code>)</td><td>Whole database while users work</td></tr>
<tr><td><b>Table space</b></td><td>Archive logging</td><td>Chosen table spaces</td></tr>
<tr><td><b>Incremental</b> (cumulative)</td><td><code>TRACKMOD YES</code> + a full backup since enabling it (<code>SQL2426N</code>)</td><td>Everything changed since the last full</td></tr>
<tr><td><b>Delta</b> (incremental delta)</td><td>same</td><td>Everything changed since the last backup of any kind</td></tr></table>
<p>The image name tells you what it is: <code>SAMPLE.0.db2inst1.DBPART000.20261117224601.001</code> = database, type (<code>0</code> full db, <code>3</code> table space), instance, partition, <b>timestamp</b>, sequence.</p>
<h4>History file and verification</h4>
<pre class="code">db2 list history backup all for sample
ls /db2backup
db2ckbkp -h /db2backup/SAMPLE.0.db2inst1.DBPART000.20261117224601.001</pre>
<p>The <b>recovery history file</b> records every backup, restore, rollforward and load. Prune old entries with <code>PRUNE HISTORY</code> (and set <code>REC_HIS_RETENTN</code>). Always verify images with <code>db2ckbkp</code> – <b>an untested backup is not a backup</b>.</p>` },
      {
        id: 'l3', title: 'Designing a backup strategy', html: `
<p>Two numbers drive the design: <b>RPO</b> (how much data you may lose) and <b>RTO</b> (how long recovery may take).</p>
<table><tr><th>Goal</th><th>Typical approach</th></tr>
<tr><td>RPO ≈ minutes</td><td>Archive logging with logs archived continuously to a <i>different</i> disk/site; mirror logs; HADR for near-zero.</td></tr>
<tr><td>RTO short</td><td>Frequent full/incremental backups (fewer logs to replay), fast storage, practised procedure, HADR takeover.</td></tr>
<tr><td>Large database</td><td>Weekly full online, daily incremental delta, table-space backups for hot spaces.</td></tr></table>
<h4>Sample weekly plan</h4>
<table><tr><th>Day</th><th>Backup</th></tr><tr><td>Sunday</td><td>Full online (compress)</td></tr><tr><td>Mon–Sat</td><td>Incremental delta (online)</td></tr><tr><td>Continuous</td><td>Log archiving to separate storage</td></tr><tr><td>Monthly</td><td><b>Test restore + rollforward</b> on a scratch server</td></tr></table>
<h4>Checklist</h4>
<ul><li>Backups and archived logs on storage separate from the database.</li><li>Retention covers your longest recovery requirement (keep logs back to the oldest retained backup).</li><li>Enable <code>AUTO_DB_BACKUP</code> or schedule with cron / your enterprise scheduler.</li><li>Alert on failed backups and on full archive paths.</li><li>Document the restore procedure and rehearse it.</li></ul>` }
    ],
    labs: [{
      id: 'lab1', title: 'Lab 8.1 – Archive logging and the backup family', level: 'Intermediate', terminals: 1,
      goal: 'Enable archive logging, handle BACKUP PENDING, and take offline, online and incremental backups.',
      setup: [...SHOP, 'db2 "create table t (id int, v varchar(20))"', 'db2 "insert into t values (1,\'one\'),(2,\'two\')"'],
      steps: [
        { t: 'Create directories for backups and archived logs. Try an online backup – it must fail with SQL2413N (circular logging).', cmd: 'mkdir -p /db2backup /db2archive\ndb2 backup database shop online to /db2backup' },
        { t: 'Enable archive logging. Disconnect and try to reconnect: SQL1116N (backup pending).', cmd: 'db2 update db cfg for shop using logarchmeth1 disk:/db2archive\ndb2 connect reset\ndb2 connect to shop' },
        { t: 'Take the mandatory full offline backup, then reconnect.', cmd: 'db2 backup database shop to /db2backup\ndb2 connect to shop' },
        { t: 'Generate some activity, force the log to be archived, and look at the archive directory.', cmd: 'db2 "insert into t values (3,\'three\')"\ndb2 "insert into t values (4,\'four\')"\ndb2 archive log for database shop\nls /db2archive/db2inst1/SHOP/NODE0000/LOGSTREAM0000/C0000000' },
        { t: 'Take an online full backup while connected.', cmd: 'db2 backup database shop online to /db2backup' },
        { t: 'Enable change tracking. An incremental backup first fails (SQL2426N) because you need a full backup after enabling TRACKMOD.', cmd: 'db2 update db cfg for shop using trackmod yes\ndb2 backup database shop online incremental to /db2backup' },
        { t: 'Take an online full backup, then the incremental one, then review the history.', cmd: 'db2 backup database shop online to /db2backup\ndb2 backup database shop online incremental to /db2backup\ndb2 list history backup all for shop' }
      ],
      hints: ['db2 connect reset is needed before the offline backup.', 'TRACKMOD takes values YES/NO.'],
      checks: [
        { d: 'Archive logging is enabled', f: (S) => S.db('SHOP').cfg.LOGARCHMETH1.startsWith('DISK:') },
        { d: 'You saw SQL2413N, SQL1116N and SQL2426N', f: (S) => S.failed('SQL2413N') && S.failed('SQL1116N') && S.failed('SQL2426N') },
        { d: 'History has an offline (F), an online (N) and an incremental (O) backup', f: (S) => { const h = S.db('SHOP').hist; return ['F', 'N', 'O'].every((t) => h.some((x) => x.op === 'B' && x.type === t)); } },
        { d: 'At least one log file was archived', f: (S) => S.db('SHOP').archived.length >= 1 },
        { d: 'TRACKMOD is YES and you listed the history', f: (S) => S.db('SHOP').cfg.TRACKMOD === 'YES' && S.ran(/list history/i) }
      ],
      solution: ['mkdir -p /db2backup /db2archive', 'db2 backup database shop online to /db2backup', 'db2 update db cfg for shop using logarchmeth1 disk:/db2archive', 'db2 connect reset', 'db2 connect to shop', 'db2 backup database shop to /db2backup', 'db2 connect to shop', 'db2 "insert into t values (3,\'three\')"', 'db2 "insert into t values (4,\'four\')"', 'db2 archive log for database shop', 'ls /db2archive/db2inst1/SHOP/NODE0000/LOGSTREAM0000/C0000000', 'db2 backup database shop online to /db2backup', 'db2 update db cfg for shop using trackmod yes', 'db2 backup database shop online incremental to /db2backup', 'db2 backup database shop online to /db2backup', 'db2 backup database shop online incremental to /db2backup', 'db2 list history backup all for shop']
    }],
    quiz: [
      { q: 'Which logging mode is required for online backup and rollforward recovery?', o: ['Circular logging', 'Archive logging (LOGARCHMETH1 not OFF)', 'No logging', 'NOT LOGGED INITIALLY'], a: 1, why: 'Only archive logging keeps the log files that rollforward needs.' },
      { q: 'You switch a database from circular to archive logging. What happens?', o: ['Nothing', 'The database is placed in backup pending state until a full offline backup is taken', 'The log is deleted', 'The instance restarts'], a: 1, why: 'SQL1116N prevents connections until you back up.' },
      { q: 'SQL0964C means…', o: ['Table space full', 'Transaction log full', 'Deadlock', 'Backup failed'], a: 1, why: 'The active log space (primary + secondary logs) is exhausted.' },
      { q: 'What must be true before taking an incremental backup?', o: ['TRACKMOD = YES and a full backup after it was enabled', 'The instance is stopped', 'COMPRESS is on', 'LOCKTIMEOUT = 0'], a: 0, why: 'Otherwise SQL2426N is returned.' },
      { q: 'An offline backup fails with SQL1035N. What do you do?', o: ['Force applications off and make sure the database is not activated', 'Drop the database', 'Run REORG', 'Restart the OS'], a: 0, why: 'Offline backup needs exclusive access.' },
      { q: 'Which is a sensible statement about backups?', o: ['Keep them on the same disk as the database for speed', 'They are only valid if you have tested a restore', 'They are not needed with RAID', 'Only full backups are valid'], a: 1, why: 'RAID is not a backup. Test restores regularly.' }
    ],
    resources: [R.docs, { title: 'Look up: BACKUP DATABASE command', url: C.search('BACKUP DATABASE command'), note: 'All options.' }, { title: 'Look up: Logging configuration parameters', url: C.search('logging configuration parameters'), note: 'LOGFILSIZ, LOGPRIMARY, LOGSECOND, archive methods.' }, { title: 'Look up: db2ckbkp', url: C.search('db2ckbkp'), note: 'Check backup image integrity.' }]
  });

  /* ===================== MODULE 9 ===================== */
  C.add({
    n: 9, id: 'm9', icon: '🛟', title: 'Restore & Rollforward Recovery', minutes: 90,
    summary: 'Recover from failures: crash recovery, version recovery, rollforward to end of logs or a point in time, and table-space recovery.',
    objectives: ['Distinguish crash, version and rollforward recovery', 'Run RESTORE and ROLLFORWARD correctly', 'Recover to a point in time after a user error', 'Restore individual table spaces', 'Choose the right recovery for a scenario'],
    lessons: [
      {
        id: 'l1', title: 'Types of recovery', html: `
<table><tr><th>Type</th><th>When</th><th>How</th></tr>
<tr><td><b>Crash recovery</b></td><td>Instance or machine failed; files are intact</td><td>Automatic at next connect (or <code>RESTART DATABASE</code>) – uses the active log</td></tr>
<tr><td><b>Version recovery</b></td><td>Return to the exact state of a backup (circular logging databases)</td><td><code>RESTORE DATABASE</code> only – all work after the backup is lost</td></tr>
<tr><td><b>Rollforward recovery</b></td><td>Disk lost, corruption, or user error; archive logging</td><td><code>RESTORE</code> then <code>ROLLFORWARD</code> to <i>end of logs</i> or to a <i>point in time</i></td></tr>
<tr><td><b>Table space recovery</b></td><td>One table space damaged</td><td>Restore the table space, rollforward it (can be online for other spaces)</td></tr>
<tr><td><b>Dropped table recovery</b></td><td>Table dropped by mistake</td><td>Restore with the table space, rollforward with <code>RECOVER DROPPED TABLE</code> to export the data (requires <code>DROPPED TABLE RECOVERY ON</code>)</td></tr></table>
<p>The <code>RECOVER DATABASE</code> command (on real servers) automates restore + rollforward using the history file.</p>
<div class="callout tip"><b>Decision guide:</b> “Did the machine just crash?” → nothing to do, Db2 recovers itself. “Did I lose data files?” → restore + rollforward to end of logs. “Did someone delete data?” → restore + rollforward to <i>just before</i> the mistake.</div>` },
      {
        id: 'l2', title: 'RESTORE and ROLLFORWARD in detail', html: `
<pre class="code">db2 restore database sample from /db2backup
db2 restore database sample from /db2backup taken at 20261117224601
db2 restore database sample from /db2backup into newdb
db2 restore database sample from /db2backup without rolling forward
db2 restore database sample tablespace (ts1) online from /db2backup</pre>
<pre class="code">db2 rollforward database sample to end of logs and stop
db2 rollforward database sample to 2026-11-17-22.50.00 using local time and stop
db2 rollforward database sample query status
db2 rollforward database sample to end of logs and stop tablespace (ts1) online</pre>
<ul><li>If the image was taken with archive logging, the restored database is in <b>ROLLFORWARD PENDING</b> – connecting gives <code>SQL1117N</code>. You must roll forward <i>and stop</i> (or restore <code>WITHOUT ROLLING FORWARD</code> for an offline image).</li>
<li><b>Point in time</b>: timestamp format is <code>YYYY-MM-DD-HH.MM.SS</code>; say <code>USING LOCAL TIME</code> or <code>USING UTC TIME</code>. Find the right moment from application logs, the <code>db2diag.log</code>, or <code>SELECT CURRENT TIMESTAMP</code> noted before a risky change.</li>
<li><b>Stop</b> (<code>AND STOP</code> / <code>AND COMPLETE</code>) ends the rollforward and makes the database usable; before that, you can continue rolling forward with more logs.</li>
<li>The archived logs must be reachable (<code>LOGARCHMETH1</code> path or retrieved from TSM). A missing log stops the rollforward at that point.</li>
<li>After a point-in-time rollforward a new <b>log chain</b> starts – take a new full backup soon.</li>
<li>Restoring over an existing database prints <code>SQL2539W</code> – make sure that is what you want.</li></ul>
<h4>Redirected restore (concept)</h4>
<p>When container paths on the target server differ, use <code>RESTORE … REDIRECT</code>, <code>SET TABLESPACE CONTAINERS</code>, then <code>RESTORE … CONTINUE</code>. With automatic storage you can instead add <code>ON path</code> to relocate storage.</p>` },
      {
        id: 'l3', title: 'Recovery playbook', html: `
<table><tr><th>Symptom</th><th>Likely recovery</th></tr>
<tr><td>Server crashed, comes back</td><td>Do nothing; first connect runs crash recovery. Check <code>db2diag</code>.</td></tr>
<tr><td>Storage failure, database files gone</td><td><code>RESTORE</code> latest backup + <code>ROLLFORWARD … END OF LOGS AND STOP</code></td></tr>
<tr><td>Bad batch job corrupted data at 14:05</td><td><code>RESTORE</code> + <code>ROLLFORWARD TO 14:04:59 … AND STOP</code></td></tr>
<tr><td>One table space damaged</td><td>Table-space <code>RESTORE</code> + table-space <code>ROLLFORWARD</code></td></tr>
<tr><td>Table dropped</td><td>Dropped table recovery or point-in-time to before the DROP</td></tr>
<tr><td>Need a copy elsewhere</td><td><code>RESTORE … INTO newdb</code> (then rollforward)</td></tr>
<tr><td>SQL1117N on connect</td><td>Database is rollforward pending → <code>ROLLFORWARD … AND STOP</code></td></tr>
<tr><td>SQL1116N on connect</td><td>Backup pending → take a full offline backup</td></tr></table>
<h4>Best practices</h4>
<ul><li>Write the procedure down with exact commands, paths and who decides.</li><li>Practise on a scratch server monthly; time it – that is your real RTO.</li><li>Always capture <code>list history</code> and <code>db2diag</code> output before you start (they show what happened).</li><li>After recovery, verify data and take a fresh backup.</li></ul>` }
    ],
    labs: [
      {
        id: 'lab1', title: 'Lab 9.1 – Disaster: restore and roll forward', level: 'Intermediate', terminals: 1,
        goal: 'The database is destroyed after 3 more transactions. Restore from the backup and roll forward so no committed row is lost.',
        setup: SHOP_ARCH,
        steps: [
          { t: 'The environment already has archive logging, a full backup (containing 2 orders) and an open connection. Add 3 more orders – they exist only in the logs.', cmd: 'db2 "insert into orders values (3,\'lamp\'),(4,\'desk\'),(5,\'chair\')"\ndb2 "select count(*) from orders"' },
          { t: '💥 Disaster: the database is lost.', cmd: 'db2 connect reset\ndb2 drop database shop' },
          { t: 'Restore from the backup image. Then try to connect – SQL1117N (rollforward pending).', cmd: 'db2 restore database shop from /db2backup\ndb2 connect to shop' },
          { t: 'Roll forward through all archived logs and stop.', cmd: 'db2 rollforward database shop to end of logs and stop' },
          { t: 'Connect and verify all 5 orders are back.', cmd: 'db2 connect to shop\ndb2 "select count(*) from orders"\ndb2 list history all for shop' }
        ],
        hints: ['Rollforward needs the archived logs – they stay in /db2archive even though the database was dropped.'],
        checks: [
          { d: 'You saw SQL1117N after the restore', f: (S) => S.failed('SQL1117N') },
          { d: 'Database SHOP exists and is no longer rollforward pending', f: (S) => S.db('SHOP') && !S.db('SHOP').rollfwdPending },
          { d: 'All 5 orders are recovered', f: (S) => S.rows(S.db('SHOP'), 'select count(*) from orders')[0][0] === 5 },
          { d: 'History records the restore and the rollforward', f: (S) => ['R', 'F'].every((o) => S.db('SHOP').hist.some((h) => h.op === o)) }
        ],
        solution: ['db2 "insert into orders values (3,\'lamp\'),(4,\'desk\'),(5,\'chair\')"', 'db2 "select count(*) from orders"', 'db2 connect reset', 'db2 drop database shop', 'db2 restore database shop from /db2backup', 'db2 connect to shop', 'db2 rollforward database shop to end of logs and stop', 'db2 connect to shop', 'db2 "select count(*) from orders"', 'db2 list history all for shop']
      },
      {
        id: 'lab2', title: 'Lab 9.2 – Undo an accidental DELETE (point in time)', level: 'Advanced', terminals: 1,
        goal: 'Someone ran DELETE without a WHERE clause. Recover the table to the moment just before the mistake.',
        setup: SHOP_ARCH,
        steps: [
          { t: 'Add 3 orders (committed work after the backup).', cmd: 'db2 "insert into orders values (3,\'lamp\'),(4,\'desk\'),(5,\'chair\')"' },
          { t: 'Note the current timestamp – <b>copy the value</b> (format YYYY-MM-DD-HH.MM.SS.nnnnnn). It is your recovery target.', cmd: 'db2 "values current timestamp"' },
          { t: 'Wait a couple of seconds, then make the mistake.', cmd: 'db2 "delete from orders"\ndb2 "select count(*) from orders"' },
          { t: 'Restore over the existing database (disconnect first), then roll forward to your noted timestamp (use the first 19 characters: YYYY-MM-DD-HH.MM.SS) and stop.', cmd: 'db2 connect reset\ndb2 restore database shop from /db2backup\ndb2 rollforward database shop to <YOUR-TIMESTAMP> using local time and stop' },
          { t: 'Verify: the 5 orders are back, and the DELETE is gone.', cmd: 'db2 connect to shop\ndb2 "select * from orders"' }
        ],
        hints: ['Timestamp example: 2026-11-19-11.05.33  (no spaces).', 'If the DELETE is still present, your timestamp was after it – restore and roll forward again with an earlier one.'],
        checks: [
          { d: 'You restored and rolled forward to a point in time', f: (S) => S.ran(/rollforward .* to \d{4}-\d{2}-\d{2}-\d{2}\.\d{2}\.\d{2}/i) },
          { d: 'Database is usable (not pending)', f: (S) => S.db('SHOP') && !S.db('SHOP').rollfwdPending && !S.db('SHOP').backupPending },
          { d: 'All 5 orders are back (the DELETE was undone)', f: (S) => S.rows(S.db('SHOP'), 'select count(*) from orders')[0][0] === 5 }
        ],
        solution: ['db2 "insert into orders values (3,\'lamp\'),(4,\'desk\'),(5,\'chair\')"', { cmd: 'db2 "values current timestamp"', cap: 'ts' }, 'db2 "delete from orders"', 'db2 "select count(*) from orders"', 'db2 connect reset', 'db2 restore database shop from /db2backup', 'db2 rollforward database shop to ${ts} using local time and stop', 'db2 connect to shop', 'db2 "select * from orders"']
      }
    ],
    quiz: [
      { q: 'A database using circular logging is restored from a backup. Which recovery applies?', o: ['Crash recovery', 'Version recovery', 'Rollforward recovery', 'Dropped table recovery'], a: 1, why: 'Without archived logs you can only return to the backup state.' },
      { q: 'You get SQL1117N when connecting after a restore. Meaning?', o: ['Backup pending', 'The database is rollforward pending', 'Wrong password', 'Instance down'], a: 1, why: 'Run ROLLFORWARD … AND STOP.' },
      { q: 'Which command recovers to 14:04:59 before a bad batch at 14:05?', o: ['restore … without rolling forward', 'rollforward database db to 2026-11-17-14.04.59 using local time and stop', 'rollforward database db to end of logs', 'restart database'], a: 1, why: 'Point-in-time rollforward after restoring a backup.' },
      { q: 'After a power failure, nothing is damaged. What recovers the database?', o: ['Restore', 'Crash recovery (automatic restart)', 'Rollforward', 'Backup'], a: 1, why: 'Db2 redoes/undoes from the active log automatically.' },
      { q: 'What must be accessible for rollforward to reach "end of logs"?', o: ['The archived log files', 'The old buffer pool', 'The db2diag.log', 'The registry'], a: 0, why: 'A missing log file stops rollforward at that point.' },
      { q: 'Why take a new full backup after a point-in-time recovery?', o: ['To free log space', 'A new log chain started; the old backups/logs no longer fit the new timeline', 'It is required by licensing', 'To reset statistics'], a: 1, why: 'Subsequent recovery must follow the new log chain.' }
    ],
    resources: [R.docs, { title: 'Look up: RESTORE DATABASE command', url: C.search('RESTORE DATABASE command'), note: 'Options including REDIRECT and INTO.' }, { title: 'Look up: ROLLFORWARD DATABASE command', url: C.search('ROLLFORWARD DATABASE command'), note: 'Stop points and table-space rollforward.' }, { title: 'Look up: RECOVER DATABASE command', url: C.search('RECOVER DATABASE command'), note: 'Automated restore + rollforward.' }]
  });
})();
