(function () {
  const C = (typeof window !== 'undefined' ? window : global).COURSE; const R = C.res;
  const SHOP = ['db2start', 'db2 create database shop', 'db2 connect to shop'];
  const SHOP_ARCH = ['db2start', 'mkdir -p /db2backup /db2archive', 'db2 create database shop', 'db2 update db cfg for shop using logarchmeth1 disk:/db2archive', 'db2 backup database shop to /db2backup', 'db2 connect to shop'];

  /* ===================== MODULE 10 ===================== */
  C.add({
    n: 10, id: 'm10', icon: '🔒', title: 'Locking & Concurrency', minutes: 75,
    summary: 'How Db2 keeps concurrent transactions consistent: lock modes, isolation levels, lock waits, timeouts, deadlocks and how to find and resolve blockers.',
    objectives: ['Explain lock modes and isolation levels', 'Reproduce and diagnose a lock wait with two sessions', 'Use LOCKTIMEOUT, CUR_COMMIT and db2pd -locks', 'Resolve blockers with FORCE APPLICATION', 'Recognise deadlocks and lock escalation'],
    lessons: [
      {
        id: 'l1', title: 'Locks and isolation levels', html: `
<p>A <b>lock</b> protects data a transaction is using. Locks are held until <b>COMMIT/ROLLBACK</b> (mostly), so long transactions cause waits for everyone else.</p>
<table><tr><th>Mode</th><th>Meaning</th></tr>
<tr><td><b>S</b> (share)</td><td>Readers; compatible with other S</td></tr>
<tr><td><b>U</b> (update)</td><td>Read with intent to update; prevents some deadlocks</td></tr>
<tr><td><b>X</b> (exclusive)</td><td>Writers; incompatible with everything (except uncommitted-read)</td></tr>
<tr><td><b>IS / IX / SIX</b></td><td>Intent locks on tables announcing row-level locks below</td></tr></table>
<h4>Isolation levels</h4>
<table><tr><th>Level</th><th>Db2 name</th><th>Behaviour</th></tr>
<tr><td>UR</td><td>Uncommitted Read</td><td>No read locks; may see uncommitted data (dirty reads)</td></tr>
<tr><td><b>CS</b></td><td>Cursor Stability <i>(default)</i></td><td>Lock only the current row; no dirty reads</td></tr>
<tr><td>RS</td><td>Read Stability</td><td>Rows read stay locked until commit</td></tr>
<tr><td>RR</td><td>Repeatable Read</td><td>Strongest; many locks, lowest concurrency</td></tr></table>
<pre class="code">db2 "select * from t with ur"
db2 set current isolation = UR</pre>
<h4>Currently committed (CUR_COMMIT = ON)</h4>
<p>Since Db2 9.7, under CS a reader that meets an uncommitted change does <b>not wait</b>: it reads the last committed version from the log. Writers still block writers.</p>` },
      {
        id: 'l2', title: 'Lock waits, timeouts, deadlocks', html: `
<ul><li><b>Lock wait</b> – session B wants a lock A holds; B waits. With <code>LOCKTIMEOUT = -1</code> (default) it waits forever.</li>
<li><b>Lock timeout</b> – with <code>LOCKTIMEOUT = n</code> seconds B gets <code>SQL0911N reason code 68</code> and its transaction is rolled back. Set a sensible value (e.g. 30–60).</li>
<li><b>Deadlock</b> – A waits for B and B waits for A. The <b>deadlock detector</b> (every <code>DLCHKTIME</code> ms) rolls back one victim with <code>SQL0911N reason code 2</code>.</li>
<li><b>Lock escalation</b> – too many row locks are converted into one table lock (<code>LOCKLIST</code>, <code>MAXLOCKS</code>); reduces memory but hurts concurrency. Watch <code>lock_escals</code>.</li></ul>
<h4>Find the blocker</h4>
<pre class="code">db2 list applications show detail
db2pd -db shop -locks
db2pd -db shop -applications
db2 "select * from sysibmadm.mon_lockwaits"
db2 force application (47)</pre>
<h4>Fixing the cause (not only the symptom)</h4>
<ul><li>Keep transactions <b>short</b>; commit often in batch jobs.</li><li>Access tables in the same order in all applications.</li><li>Add indexes so queries lock fewer rows.</li><li>Use CUR_COMMIT, lower isolation where acceptable.</li><li>Increase LOCKLIST (or leave it on AUTOMATIC).</li></ul>
<div class="callout tip">Forcing an application rolls back its work – tell the owner first, and prefer fixing the application.</div>` }
    ],
    labs: [{
      id: 'lab1', title: 'Lab 10.1 – Two sessions: blocker and victim', level: 'Intermediate', terminals: 2,
      goal: 'Create a lock wait with two terminals, diagnose it, then see a lock timeout and use FORCE APPLICATION.',
      setup: [...SHOP, 'db2 "create table acct (id int not null primary key, bal int)"', 'db2 "insert into acct values (1,100),(2,200)"'],
      steps: [
        { t: '<b>Terminal 1</b>: turn autocommit off and update a row without committing.', cmd: 'db2 +c "update acct set bal = 150 where id = 1"' },
        { t: '<b>Terminal 2</b>: connect and read the table. CUR_COMMIT is ON, so you get the committed value without waiting.', cmd: 'db2 connect to shop\ndb2 "select * from acct"' },
        { t: '<b>Terminal 2</b>: now try to update the same table – the statement waits (simulated message).', cmd: 'db2 "update acct set bal = 999 where id = 1"' },
        { t: '<b>Terminal 1</b>: inspect the locks, then set a lock timeout and let terminal 2 try again.', cmd: 'db2pd -db shop -locks\ndb2 update db cfg for shop using locktimeout 10' },
        { t: '<b>Terminal 2</b>: retry. With a timeout set you now get SQL0911N reason code 68.', cmd: 'db2 "update acct set bal = 999 where id = 1"' },
        { t: '<b>Terminal 1</b>: find the applications and force terminal 2 off (practice only), then commit.', cmd: 'db2 list applications show detail\ndb2 force application all\ndb2 connect to shop\ndb2 commit' }
      ],
      hints: ['db2 +c turns autocommit off for that one statement.', 'Terminal 2 is the second tab above the terminal.'],
      checks: [
        { d: 'You saw a lock wait on the second terminal', f: (S) => S.sim.events.some((e) => !e.ok && /WAITING/.test(e.out || '')) },
        { d: 'LOCKTIMEOUT was configured', f: (S) => S.db('SHOP').cfg.LOCKTIMEOUT !== '-1' },
        { d: 'You saw SQL0911N (timeout)', f: (S) => S.failed('SQL0911N') },
        { d: 'You ran db2pd -locks', f: (S) => S.ran(/db2pd.*-locks/i) },
        { d: 'You used FORCE APPLICATION', f: (S) => S.ran(/force application/i) }
      ],
      solution: [
        { t: 0, cmd: 'db2 +c "update acct set bal = 150 where id = 1"' },
        { t: 1, cmd: 'db2 connect to shop' }, { t: 1, cmd: 'db2 "select * from acct"' }, { t: 1, cmd: 'db2 "update acct set bal = 999 where id = 1"' },
        { t: 0, cmd: 'db2pd -db shop -locks' }, { t: 0, cmd: 'db2 update db cfg for shop using locktimeout 10' },
        { t: 1, cmd: 'db2 "update acct set bal = 999 where id = 1"' },
        { t: 0, cmd: 'db2 list applications show detail' }, { t: 0, cmd: 'db2 force application all' }, { t: 0, cmd: 'db2 connect to shop' }, { t: 0, cmd: 'db2 commit' }
      ]
    }],
    quiz: [
      { q: 'Which isolation level is the Db2 default?', o: ['UR', 'CS', 'RS', 'RR'], a: 1, why: 'Cursor Stability.' },
      { q: 'LOCKTIMEOUT = -1 means…', o: ['No locking', 'Wait indefinitely for locks', 'Timeout after 1 second', 'Use deadlock detector only'], a: 1, why: 'The default is to wait forever – usually set to a finite value.' },
      { q: 'With CUR_COMMIT=ON, a reader meeting an uncommitted update…', o: ['Waits', 'Reads the last committed version', 'Gets SQL0911N', 'Escalates the lock'], a: 1, why: 'Readers do not block on writers.' },
      { q: 'Which reason code of SQL0911N indicates a deadlock?', o: ['2', '68', '9', '100'], a: 0, why: 'RC 2 = deadlock victim, RC 68 = lock timeout.' },
      { q: 'Which tool shows current lock holders and waiters from the command line?', o: ['db2look', 'db2pd -locks', 'db2ckbkp', 'db2exfmt'], a: 1, why: 'Also MON_LOCKWAITS and GET_LOCKS views.' },
      { q: 'What is lock escalation?', o: ['Many row locks converted into a table lock to save lock memory', 'A deadlock', 'Increasing isolation', 'A lock moving between members'], a: 0, why: 'Controlled by LOCKLIST and MAXLOCKS.' }
    ],
    resources: [R.docs, { title: 'Look up: Locks and concurrency control', url: C.search('locks and concurrency control'), note: 'Lock modes, compatibility, isolation.' }, { title: 'Look up: MON_GET_LOCKS', url: C.search('MON_GET_LOCKS'), note: 'SQL monitoring of locks.' }, { title: 'Look up: Lock timeout and deadlock event monitors', url: C.search('lock event monitor'), note: 'Capture history for later analysis.' }]
  });

  /* ===================== MODULE 11 ===================== */
  C.add({
    n: 11, id: 'm11', icon: '📈', title: 'Monitoring, Maintenance & Tuning', minutes: 90,
    summary: 'Keep Db2 healthy and fast: statistics, REORG, explain plans, monitoring table functions and the buffer pool hit ratio.',
    objectives: ['Collect statistics with RUNSTATS and know why the optimizer needs them', 'Decide when to REORG with REORGCHK', 'Read an access plan (TBSCAN vs IXSCAN)', 'Use MON_GET_* functions and db2pd for monitoring', 'Follow a systematic tuning method'],
    lessons: [
      {
        id: 'l1', title: 'Statistics, RUNSTATS and REORG', html: `
<p>The <b>optimizer</b> picks an access plan from <i>statistics</i> in the catalog (cardinality, pages, index levels, value distributions). Missing or stale statistics are the #1 cause of sudden slow queries.</p>
<pre class="code">db2 "runstats on table db2inst1.emp with distribution and detailed indexes all"
db2 "select tabname, card, npages, stats_time from syscat.tables where tabschema='DB2INST1'"
db2 update db cfg for shop using auto_runstats on</pre>
<p>Deleting and updating rows leaves free space inside pages and overflow records. <b>REORGCHK</b> measures this (formulas F1–F8); <b>REORG</b> rebuilds the table:</p>
<pre class="code">db2 reorgchk update statistics on table all
db2 reorg table db2inst1.emp
db2 reorg indexes all for table db2inst1.emp
db2 runstats on table db2inst1.emp and indexes all</pre>
<div class="callout tip">Always run <b>RUNSTATS after REORG</b>, and rebind static packages (<code>db2rbind</code>) after big statistics changes. Online REORG is available with <code>INPLACE ALLOW WRITE ACCESS</code>.</div>` },
      {
        id: 'l2', title: 'Explain: reading access plans', html: `
<pre class="code">db2 "explain plan for select * from emp where id = 7"
db2exfmt -d shop -1
db2 "explain plan for select * from emp where dept = 'IT'"
db2exfmt -d shop -1</pre>
<table><tr><th>Operator</th><th>Meaning</th></tr>
<tr><td><b>TBSCAN</b></td><td>Read the whole table. Fine for small tables; a red flag on big ones when only a few rows are wanted</td></tr>
<tr><td><b>IXSCAN</b></td><td>Read an index range</td></tr>
<tr><td><b>FETCH</b></td><td>Get the table row for an index entry</td></tr>
<tr><td><b>NLJOIN / HSJOIN / MSJOIN</b></td><td>Nested-loop, hash, merge join</td></tr>
<tr><td><b>SORT</b></td><td>Sort for ORDER BY / GROUP BY / merge join</td></tr></table>
<p>Compare the <b>timerons</b> (estimated cost units). Typical fixes: create an index matching the WHERE/JOIN columns, collect statistics, rewrite non-sargable predicates (<code>WHERE UPPER(name)=…</code> cannot use a plain index).</p>
<p>Tools beyond this course: <b>Db2 Advisor (<code>db2advis</code>)</b> recommends indexes; <b>Data Server Manager</b>/<b>Db2 Console</b> give dashboards.</p>` },
      {
        id: 'l3', title: 'Monitoring and a tuning method', html: `
<table><tr><th>Question</th><th>Tool</th></tr>
<tr><td>Who is connected?</td><td><code>db2 list applications show detail</code>, <code>MON_GET_CONNECTION</code></td></tr>
<tr><td>Which SQL is expensive?</td><td><code>MON_GET_PKG_CACHE_STMT</code> (order by <code>TOTAL_ACT_TIME</code> or <code>ROWS_READ</code>)</td></tr>
<tr><td>Is memory right?</td><td>Buffer pool hit ratios: <code>MON_GET_BUFFERPOOL</code>, <code>db2pd -bufferpools</code> (aim &gt;95 % data, &gt;98 % index for OLTP)</td></tr>
<tr><td>Is space right?</td><td><code>MON_GET_TABLESPACE</code>, <code>ADMIN_GET_TAB_INFO</code></td></tr>
<tr><td>Locks/log full?</td><td><code>db2pd -locks</code>, <code>db2pd -logs</code></td></tr>
<tr><td>What went wrong?</td><td><code>db2diag</code> (db2diag.log), <code>db2 get notification</code>/Health alerts</td></tr></table>
<pre class="code">db2 "select substr(stmt_text,1,60) stmt, num_executions, rows_read, rows_returned from table(mon_get_pkg_cache_stmt(null,null,null,-2)) order by rows_read desc fetch first 5 rows only"</pre>
<h4>Tuning method</h4>
<ol><li><b>Measure</b> – baseline (hit ratios, top SQL, waits).</li><li>Find the <b>biggest</b> bottleneck (CPU, I/O, locks, memory).</li><li>Change <b>one thing</b>.</li><li>Measure again; keep or revert.</li><li>Prefer fixing SQL and indexes before adding hardware; consider <code>SELF_TUNING_MEM ON</code> and AUTOMATIC settings.</li></ol>` }
    ],
    labs: [{
      id: 'lab1', title: 'Lab 11.1 – Statistics, explain and an index', level: 'Intermediate', terminals: 1,
      goal: 'Make a slow lookup fast: collect statistics, read the plan, add an index, verify the plan changes from TBSCAN to IXSCAN, and run REORGCHK/REORG.',
      setup: [...SHOP, 'db2 "create table big (id int not null, grp int, pad varchar(20))"', 'db2 "insert into big with r(n) as (select 1 union all select n+1 from r where n < 3000) select n, n % 50, \'x\' from r"'],
      steps: [
        { t: 'Check that statistics are missing, then collect them.', cmd: 'db2 "select tabname, card, stats_time from syscat.tables where tabname = \'BIG\'"\ndb2 "runstats on table db2inst1.big"' },
        { t: 'Explain a point lookup and format the plan – expect TBSCAN.', cmd: 'db2 "explain plan for select * from big where id = 1234"\ndb2exfmt -d shop -1' },
        { t: 'Create an index, refresh statistics and explain again – expect IXSCAN.', cmd: 'db2 "create index ix_big_id on big (id)"\ndb2 "runstats on table db2inst1.big and indexes all"\ndb2 "explain plan for select * from big where id = 1234"\ndb2exfmt -d shop -1' },
        { t: 'Churn the table, then check whether a REORG is recommended and perform it.', cmd: 'db2 "delete from big where grp < 30"\ndb2 reorgchk update statistics on table all\ndb2 reorg table db2inst1.big\ndb2 runstats on table db2inst1.big and indexes all' },
        { t: 'Look at the most expensive statements in the package cache.', cmd: 'db2 "select substr(stmt_text,1,50) stmt, num_executions, rows_read from table(mon_get_pkg_cache_stmt(null,null,null,-2)) order by rows_read desc fetch first 3 rows only"' }
      ],
      hints: ['db2exfmt -d shop -1 formats the most recent explain.', 'The index must exist before the second explain.'],
      checks: [
        { d: 'RUNSTATS was run on BIG', f: (S) => !!S.db('SHOP').tables.BIG.stats },
        { d: 'Index on BIG(ID) exists', f: (S) => Object.values(S.db('SHOP').indexes).some((i) => i.table === 'BIG') },
        { d: 'You explained at least two statements', f: (S) => S.sim.events.filter((e) => e.ok && /^db2 +"?explain plan/i.test(e.cmd)).length >= 2 },
        { d: 'The last plan uses the index (IXSCAN)', f: (S) => S.sim.events.filter((e) => /db2exfmt/.test(e.cmd)).slice(-1).some((e) => /IXSCAN/.test(e.out || '')) },
        { d: 'REORG and REORGCHK were run', f: (S) => S.ran(/reorg table/i) && S.ran(/reorgchk/i) }
      ],
      solution: ['db2 "select tabname, card, stats_time from syscat.tables where tabname = \'BIG\'"', 'db2 "runstats on table db2inst1.big"', 'db2 "explain plan for select * from big where id = 1234"', 'db2exfmt -d shop -1', 'db2 "create index ix_big_id on big (id)"', 'db2 "runstats on table db2inst1.big and indexes all"', 'db2 "explain plan for select * from big where id = 1234"', 'db2exfmt -d shop -1', 'db2 "delete from big where grp < 30"', 'db2 reorgchk update statistics on table all', 'db2 reorg table db2inst1.big', 'db2 runstats on table db2inst1.big and indexes all', 'db2 "select substr(stmt_text,1,50) stmt, num_executions, rows_read from table(mon_get_pkg_cache_stmt(null,null,null,-2)) order by rows_read desc fetch first 3 rows only"']
    }],
    quiz: [
      { q: 'Why does RUNSTATS matter?', o: ['It compresses data', 'The optimizer chooses access plans from catalog statistics', 'It frees log space', 'It backs up the table'], a: 1, why: 'Stale statistics lead to poor plans.' },
      { q: 'Which operator means "read every row of the table"?', o: ['IXSCAN', 'TBSCAN', 'FETCH', 'SORT'], a: 1, why: 'Table scan.' },
      { q: 'What do you do after REORG TABLE?', o: ['Restart the instance', 'RUNSTATS (and rebind as needed)', 'Backup pending clears', 'Nothing'], a: 1, why: 'REORG changes physical layout; refresh the statistics.' },
      { q: 'Which function lists the most expensive cached SQL statements?', o: ['MON_GET_PKG_CACHE_STMT', 'SNAP_GET_LOCK', 'ADMIN_CMD', 'SYSPROC.REORG'], a: 0, why: 'Order by TOTAL_ACT_TIME or ROWS_READ.' },
      { q: 'A good OLTP buffer-pool data hit ratio is generally…', o: ['> 95 %', '≈ 50 %', '< 10 %', 'Irrelevant'], a: 0, why: 'Higher hit ratio = fewer physical reads.' },
      { q: 'Which is the best first step when a query is slow?', o: ['Buy more memory', 'Explain the query and check statistics/indexes', 'Restart Db2', 'Drop the buffer pool'], a: 1, why: 'Measure before changing anything.' }
    ],
    resources: [R.docs, { title: 'Look up: RUNSTATS command', url: C.search('RUNSTATS command'), note: 'Options for distribution stats, sampling.' }, { title: 'Look up: REORGCHK command', url: C.search('REORGCHK command'), note: 'Formulas F1–F8.' }, { title: 'Look up: MON_GET_PKG_CACHE_STMT', url: C.search('MON_GET_PKG_CACHE_STMT'), note: 'Top-SQL analysis.' }, { title: 'Look up: Explain facility', url: C.search('explain facility db2exfmt'), note: 'Access plans in detail.' }]
  });

  /* ===================== MODULE 12 ===================== */
  C.add({
    n: 12, id: 'm12', icon: '🛰️', title: 'High Availability (HADR) & Troubleshooting', minutes: 90,
    summary: 'Keep Db2 available with HADR, perform a takeover, and build a repeatable approach to diagnosing real problems.',
    objectives: ['Explain HADR roles, states and synchronization modes', 'Configure HADR and take over to the standby', 'Know related HA options (pureScale, Db2 replication, cloud)', 'Diagnose with db2diag.log and a standard checklist', 'Fix the common "database will not connect" problems'],
    lessons: [
      {
        id: 'l1', title: 'HADR: High Availability Disaster Recovery', html: `
<p><b>HADR</b> ships transaction log records from a <b>primary</b> database to one or more <b>standby</b> databases that continuously replay them. If the primary fails, a standby takes over in seconds.</p>
<table><tr><th>HADR_SYNCMODE</th><th>Commit completes when…</th><th>Data loss on failover</th></tr>
<tr><td><b>SYNC</b></td><td>logs written on primary <i>and</i> standby disk</td><td>None (if in peer)</td></tr>
<tr><td><b>NEARSYNC</b> <i>(default)</i></td><td>logs written on primary disk and standby <i>memory</i></td><td>Only if both fail together</td></tr>
<tr><td><b>ASYNC</b></td><td>logs sent to the network</td><td>Possible – used for distant DR sites</td></tr>
<tr><td><b>SUPERASYNC</b></td><td>immediately (never waits)</td><td>Possible; no impact on primary</td></tr></table>
<p><b>States:</b> <code>LOCAL_CATCHUP</code> → <code>REMOTE_CATCHUP</code> → <b><code>PEER</code></b> (in sync). <b>Requirements:</b> same Db2 version/OS family, archive logging (<code>LOGARCHMETH1</code>), a database built from a <b>backup restored on the standby</b>, and the HADR_* parameters set on both sides.</p>
<pre class="code">db2 update db cfg for shop using HADR_LOCAL_HOST db2server HADR_LOCAL_SVC 55001 \\
    HADR_REMOTE_HOST db2standby HADR_REMOTE_SVC 55002 HADR_REMOTE_INST db2inst1 \\
    HADR_SYNCMODE NEARSYNC
db2 start hadr on database shop as primary
db2pd -db shop -hadr
-- on the standby:
db2 takeover hadr on database shop            -- planned, roles swap
db2 takeover hadr on database shop by force   -- primary is dead</pre>
<div class="callout warn"><b>Never</b> force a takeover while the old primary may still be alive and serving clients – this causes <i>split brain</i>. Use a cluster manager (Tivoli SA MP / Pacemaker, built into Db2) for automatic failover and a virtual IP or ACR (automatic client reroute: <code>UPDATE ALTERNATE SERVER</code>) so applications reconnect.</div>
<p>Standbys can also serve <b>read-only</b> work (reads on standby, <code>DB2_HADR_ROS</code>) and up to 3 standbys are supported (multiple standbys).</p>` },
      {
        id: 'l2', title: 'Other availability options', html: `
<table><tr><th>Option</th><th>Idea</th></tr>
<tr><td><b>pureScale</b></td><td>Active-active cluster of members sharing storage; continuous availability and scale-out</td></tr>
<tr><td><b>Q Replication / SQL Replication / CDC</b></td><td>Logical replication, can replicate to other databases or versions; active-active possible</td></tr>
<tr><td><b>Backup/restore + log shipping</b></td><td>The classic manual warm standby</td></tr>
<tr><td><b>Cloud services (Db2 on Cloud, Db2 Warehouse)</b></td><td>Provider-managed HA/DR</td></tr>
<tr><td><b>Db2 on OpenShift / Kubernetes (Db2u)</b></td><td>Containerised Db2 with built-in HADR operator</td></tr></table>
<p>Choose by <b>RTO/RPO</b>, cost and complexity; HADR is the most common for single-database HA on LUW.</p>` },
      {
        id: 'l3', title: 'Troubleshooting toolkit and playbook', html: `
<p>Work from symptom to cause with the <b>same checklist every time</b>:</p>
<ol><li><b>What exactly is the error?</b> SQLCODE/SQLSTATE: <code>db2 "? SQL1116N"</code> (or search IBM Docs) explains any message.</li>
<li><b>Is the instance up?</b> <code>db2pd -</code>, <code>db2start</code>, <code>ps -ef | grep db2sysc</code>.</li>
<li><b>Look at the diagnostic log:</b> <code>db2diag -l Error,Severe</code>, <code>db2diag -H 1h</code>, the <code>DIAGPATH</code> dir, <code>db2 get dbm cfg | grep DIAGPATH</code>, plus the OS log and disk space (<code>df -h</code>).</li>
<li><b>What changed?</b> config (<code>db2 get db cfg</code>), recent backups/loads (<code>list history</code>), patches, application releases.</li>
<li><b>Reproduce on a copy</b> if risky, then fix one thing at a time and record it.</li>
<li><b>Collect data</b> for IBM Support: <code>db2support . -d shop -s -c</code> (or <code>-g</code>).</li></ol>
<h4>Common problems</h4>
<table><tr><th>Symptom</th><th>Cause → Fix</th></tr>
<tr><td>SQL1032N no start database manager command</td><td>Instance not started → <code>db2start</code></td></tr>
<tr><td>SQL1116N backup pending</td><td>Logging mode changed / load without recovery → full offline backup</td></tr>
<tr><td>SQL1117N rollforward pending</td><td>Restore left it that way → rollforward … and stop</td></tr>
<tr><td>SQL0964C log full</td><td>Long transaction/inactive archive → commit, increase LOGPRIMARY/LOGSECOND/LOGFILSIZ, fix archiving</td></tr>
<tr><td>SQL0968C file system full</td><td>Add space; check backups, archive path, tablespace containers, DIAGPATH</td></tr>
<tr><td>SQL0911N RC 68 / RC 2</td><td>Lock timeout / deadlock → see Module 10</td></tr>
<tr><td>SQL1031N database directory not found</td><td>Not cataloged / wrong name → <code>list db directory</code>, <code>catalog database</code></td></tr>
<tr><td>SQL30081N communication error</td><td>Network, firewall, wrong port or DB2COMM → check services and TCP/IP</td></tr>
<tr><td>SQL0551N</td><td>Missing privilege → grant it (Module 7)</td></tr></table>` }
    ],
    labs: [
      {
        id: 'lab1', title: 'Lab 12.1 – Configure HADR and take over', level: 'Advanced', terminals: 1,
        goal: 'Configure HADR for SHOP, start it as primary, check PEER state, then perform a role-swap takeover from the (simulated) standby server and back.',
        setup: SHOP_ARCH,
        steps: [
          { t: 'The database is in archive mode with a backup (see setup). Configure the HADR parameters.', cmd: 'db2 update db cfg for shop using HADR_LOCAL_HOST db2server HADR_LOCAL_SVC 55001 HADR_REMOTE_HOST db2standby HADR_REMOTE_SVC 55002 HADR_REMOTE_INST db2inst1 HADR_SYNCMODE NEARSYNC' },
          { t: 'Start HADR as primary and check the state – it should reach PEER.', cmd: 'db2 connect reset\ndb2 start hadr on database shop as primary\ndb2pd -db shop -hadr' },
          { t: 'Log in to the standby server and take over (planned switch).', cmd: 'ssh db2standby\ndb2 takeover hadr on database shop\ndb2pd -db shop -hadr' },
          { t: 'Return to the original server and take over again to restore the original roles.', cmd: 'exit\ndb2 takeover hadr on database shop\ndb2pd -db shop -hadr' }
        ],
        hints: ['Type "exit" to leave the standby shell.', 'On a real system the standby is built by restoring the primary backup on the other server first.'],
        checks: [
          { d: 'HADR parameters are configured', f: (S) => S.db('SHOP').cfg.HADR_REMOTE_HOST === 'db2standby' },
          { d: 'HADR is started and in PEER state', f: (S) => !!S.db('SHOP').hadr && S.db('SHOP').hadr.state === 'PEER' },
          { d: 'You performed a takeover', f: (S) => S.ran(/takeover hadr/i) },
          { d: 'The original server is primary again', f: (S) => S.db('SHOP').hadr.primaryHost === 'primary' }
        ],
        solution: ['db2 update db cfg for shop using HADR_LOCAL_HOST db2server HADR_LOCAL_SVC 55001 HADR_REMOTE_HOST db2standby HADR_REMOTE_SVC 55002 HADR_REMOTE_INST db2inst1 HADR_SYNCMODE NEARSYNC', 'db2 connect reset', 'db2 start hadr on database shop as primary', 'db2pd -db shop -hadr', 'ssh db2standby', 'db2 takeover hadr on database shop', 'db2pd -db shop -hadr', 'exit', 'db2 takeover hadr on database shop', 'db2pd -db shop -hadr']
      },
      {
        id: 'lab2', title: 'Lab 12.2 – Troubleshooting drill: "I cannot connect!"', level: 'Advanced', terminals: 1,
        goal: 'An application team reports they cannot connect to PAYROLL. Diagnose and fix the problem, then prove the database works and is protected by a backup.',
        setup: ['db2start', 'mkdir -p /db2backup /db2archive', 'db2 create database payroll', 'db2 update db cfg for payroll using logarchmeth1 disk:/db2archive'],
        steps: [
          { t: 'Reproduce the problem.', cmd: 'db2 connect to payroll' },
          { t: 'Look up the message and check the logs and configuration for clues.', cmd: 'db2diag\ndb2 get db cfg for payroll' },
          { t: 'Apply the fix the message demands (a full offline backup).', cmd: 'db2 backup database payroll to /db2backup' },
          { t: 'Verify you can connect and work, then check the history.', cmd: 'db2 connect to payroll\ndb2 "create table pay (id int, amt int)"\ndb2 list history backup all for payroll' }
        ],
        hints: ['SQL1116N: BACKUP PENDING. Switching to archive logging requires a full offline backup.'],
        checks: [
          { d: 'You reproduced SQL1116N', f: (S) => S.failed('SQL1116N') },
          { d: 'You consulted db2diag', f: (S) => S.ran(/^db2diag/i) },
          { d: 'The database is no longer backup pending', f: (S) => !S.db('PAYROLL').backupPending },
          { d: 'A table was created after the fix', f: (S) => !!S.db('PAYROLL').tables.PAY }
        ],
        solution: ['db2 connect to payroll', 'db2diag', 'db2 get db cfg for payroll', 'db2 backup database payroll to /db2backup', 'db2 connect to payroll', 'db2 "create table pay (id int, amt int)"', 'db2 list history backup all for payroll']
      }
    ],
    quiz: [
      { q: 'Which HADR sync mode is the default?', o: ['SYNC', 'NEARSYNC', 'ASYNC', 'SUPERASYNC'], a: 1, why: 'NEARSYNC balances protection and performance.' },
      { q: 'What is required before starting HADR?', o: ['Circular logging', 'Archive logging and a standby restored from a primary backup', 'An empty standby', 'Dropping all indexes'], a: 1, why: 'HADR replays logs; the standby starts from a backup image.' },
      { q: 'What does "TAKEOVER HADR … BY FORCE" risk?', o: ['Nothing', 'Split brain if the old primary is still running', 'Table corruption always', 'Log deletion'], a: 1, why: 'Only use it when the primary is definitely down.' },
      { q: 'What file is the first place to look for Db2 errors on the server?', o: ['db2diag.log (DIAGPATH)', 'syscat.tables', 'db2nodes.cfg', 'The backup image'], a: 0, why: 'Use db2diag to filter it.' },
      { q: 'SQL1116N on connect means…', o: ['Rollforward pending', 'Backup pending – take a full offline backup', 'Wrong password', 'Network down'], a: 1, why: 'Typical after changing to archive logging.' },
      { q: 'Which feature helps client applications reconnect to the new primary after takeover?', o: ['Automatic client reroute (alternate server)', 'REORG', 'RUNSTATS', 'LOAD'], a: 0, why: 'ACR, configured with UPDATE ALTERNATE SERVER.' }
    ],
    resources: [R.docs, { title: 'Look up: High availability disaster recovery (HADR)', url: C.search('High availability disaster recovery HADR'), note: 'Complete HADR guide.' }, { title: 'Look up: db2diag tool', url: C.search('db2diag tool'), note: 'Filtering the diagnostic log.' }, { title: 'Look up: db2support', url: C.search('db2support command'), note: 'Collect data for IBM Support.' }, R.community, R.redbooks, R.training]
  });
})();
