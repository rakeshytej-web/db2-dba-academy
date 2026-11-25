(function () {
  const C = (typeof window !== 'undefined' ? window : global).COURSE; const R = C.res;

  /* ===================== MODULE 1 ===================== */
  C.add({
    n: 1, id: 'm1', icon: '🏛️', title: 'Db2 Architecture & Fundamentals', minutes: 60,
    summary: 'What Db2 for Linux, UNIX and Windows (LUW) is, what a DBA is responsible for, and how instances, databases, processes, memory and storage fit together.',
    objectives: ['Explain the role of a Db2 DBA and the Db2 editions', 'Describe the instance → database → table space → table hierarchy', 'Name the main engine processes (EDUs) and memory areas', 'Use db2start, db2level, get instance and get dbm cfg'],
    lessons: [
      {
        id: 'l1', title: 'What Db2 LUW is and what a DBA does', html: `
<p><b>Db2 LUW</b> is IBM's relational database for Linux, UNIX and Windows. The same engine runs on-premises, in containers (the free <i>Db2 Community Edition</i> Docker image) and as IBM-managed cloud services. Current releases are in the <b>11.5</b> and <b>12.1</b> lines; the administration concepts in this course apply to both.</p>
<h4>The DBA's responsibilities</h4>
<table><tr><th>Area</th><th>What you do</th><th>Module</th></tr>
<tr><td>Install &amp; configure</td><td>Create instances, set registry and configuration parameters</td><td>2</td></tr>
<tr><td>Design storage</td><td>Databases, buffer pools, table spaces</td><td>3, 4</td></tr>
<tr><td>Objects &amp; data</td><td>Tables, indexes, load/unload data</td><td>5, 6</td></tr>
<tr><td>Security</td><td>Authorities, privileges, roles</td><td>7</td></tr>
<tr><td>Protect data</td><td>Logging, backup, restore, rollforward</td><td>8, 9</td></tr>
<tr><td>Performance</td><td>Locking, monitoring, RUNSTATS/REORG, explain</td><td>10, 11</td></tr>
<tr><td>Availability &amp; support</td><td>HADR, diagnostics, troubleshooting</td><td>12</td></tr></table>
<h4>Editions (high level)</h4>
<ul><li><b>Community Edition</b> – free, resource-limited (check IBM for current limits); ideal for learning.</li>
<li><b>Standard / Advanced</b> – production editions; Advanced adds features such as HADR with multiple standbys and workload management options.</li>
<li><b>pureScale</b> – shared-disk clustering for continuous availability (concept covered in Module 12).</li></ul>
<div class="callout tip"><b>Tip:</b> Everything you type in this app's terminal is the same Db2 command line (CLP) syntax you will use on a real server. The <i>Install guide</i> in the downloaded package shows how to run the same labs on a real Db2 container.</div>` },
      {
        id: 'l2', title: 'Instance, database and process model', html: `
<p>Db2 organises everything in a hierarchy. Learn this picture; every later module hangs off it.</p>
<pre class="diagram">Server (OS)
 └── Instance  (db2inst1)           ← one set of engine processes, one DBM configuration
      ├── Database SAMPLE           ← own catalog, logs, buffer pools, DB configuration
      │    ├── Table space SYSCATSPACE / USERSPACE1 / TEMPSPACE1
      │    │    └── Containers (files) → extents → pages
      │    ├── Schemas → Tables, Indexes, Views ...
      │    └── Transaction log files
      └── Database SALES            ← isolated from SAMPLE</pre>
<h4>Instance</h4>
<p>An <b>instance</b> is a Db2 environment owned by an operating-system user (the <i>instance owner</i>, e.g. <code>db2inst1</code>). It has its own <b>database manager configuration</b> (<code>DBM CFG</code>) and registry settings. You can run several instances on one server, e.g. one for production and one for testing.</p>
<h4>Processes</h4>
<p>When you run <code>db2start</code> the engine process <code>db2sysc</code> starts. Inside it, work is done by <b>EDUs</b> (engine dispatchable units, implemented as threads on Linux):</p>
<table><tr><th>EDU</th><th>Job</th></tr>
<tr><td><code>db2agent</code></td><td>Does the SQL work for one connected application</td></tr>
<tr><td><code>db2loggw</code> / <code>db2loggr</code></td><td>Log writer / log reader – writes the transaction log</td></tr>
<tr><td><code>db2pclnr</code></td><td>Page cleaners – write changed pages from the buffer pool to disk</td></tr>
<tr><td><code>db2pfchr</code></td><td>Prefetchers – read pages ahead of the query</td></tr>
<tr><td><code>db2logmgr</code></td><td>Archives completed log files</td></tr>
<tr><td><code>db2dlock</code></td><td>Deadlock detector</td></tr></table>
<p>The command line processor you type into is <code>db2</code>; it hands your commands to a <i>back-end process</i> (<code>db2bp</code>) that keeps your database connection.</p>
<h4>Directories you should recognise</h4>
<pre class="code-plain">~/sqllib                                   instance directory (config, db2dump/db2diag.log)
~/db2inst1/NODE0000/SQL00001/              first database's files (catalog, logs, config)
~/sqllib/db2dump                           diagnostic logs (db2diag.log)</pre>` },
      {
        id: 'l3', title: 'Memory and storage at a glance', html: `
<h4>Memory</h4>
<table><tr><th>Level</th><th>Examples</th></tr>
<tr><td>Instance</td><td>Monitor heap, instance shared memory (<code>INSTANCE_MEMORY</code>)</td></tr>
<tr><td>Database</td><td><b>Buffer pools</b>, package cache, lock list, sort heap (shared), utility heap, catalog cache</td></tr>
<tr><td>Application / agent</td><td>Application heap, statement heap, private sort memory</td></tr></table>
<p>The <b>buffer pool</b> caches data and index pages so queries read memory instead of disk. It is the single most important tuning area (Module 4 and 11). With <code>SELF_TUNING_MEM ON</code> Db2 resizes many of these automatically.</p>
<h4>Storage</h4>
<ul><li><b>Page</b> – smallest I/O unit: 4, 8, 16 or 32 KB.</li><li><b>Extent</b> – a group of pages allocated together (e.g. 4 or 32 pages).</li><li><b>Container</b> – a file/device/directory that provides space.</li><li><b>Table space</b> – a logical storage unit made of containers; tables live in table spaces.</li><li><b>Automatic storage</b> – Db2 manages containers for you from storage paths (the default).</li></ul>
<h4>Logging (preview)</h4>
<p>Every change is written to the <b>transaction log</b> <i>before</i> the data page is written to disk (write-ahead logging). This gives atomic commits, crash recovery and – with archive logging – rollforward recovery (Modules 8–9).</p>
<h4>The catalog</h4>
<p>Each database has system catalog tables/views under the schema <code>SYSCAT</code> (e.g. <code>SYSCAT.TABLES</code>, <code>SYSCAT.TABLESPACES</code>). You will query them constantly.</p>` }
    ],
    labs: [{
      id: 'lab1', title: 'Lab 1.1 – Meet your instance', level: 'Beginner', terminals: 1,
      goal: 'Start the instance, inspect its version and configuration, and create your first database.',
      setup: [],
      steps: [
        { t: 'Check who you are and where you are: <code>whoami</code>', cmd: 'whoami' },
        { t: 'Show the Db2 version/level: <code>db2level</code>', cmd: 'db2level' },
        { t: 'List instances: <code>db2ilist</code>', cmd: 'db2ilist' },
        { t: 'Start the instance (the engine process): <code>db2start</code>', cmd: 'db2start' },
        { t: 'Show the current instance, then look at diagnostic settings in the DBM configuration using grep.', cmd: 'db2 get instance\ndb2 get dbm cfg | grep -i diag' },
        { t: 'Create the database <b>SAMPLE</b> and list the database directory.', cmd: 'db2 create database sample\ndb2 list db directory' }
      ],
      hints: ['db2start must succeed before CREATE DATABASE.', 'The database name is limited to 8 characters.'],
      checks: [
        { d: 'Instance is started', f: (S) => S.sim.inst.started },
        { d: 'You ran db2level', f: (S) => S.ran(/^db2level/) },
        { d: 'You inspected the DBM configuration', f: (S) => S.ran(/get dbm cfg/i) },
        { d: 'Database SAMPLE exists', f: (S) => !!S.db('SAMPLE') },
        { d: 'You listed the database directory', f: (S) => S.ran(/list (db|database) directory/i) }
      ],
      solution: ['whoami', 'db2level', 'db2ilist', 'db2start', 'db2 get instance', 'db2 get dbm cfg | grep -i diag', 'db2 create database sample', 'db2 list db directory']
    }],
    quiz: [
      { q: 'Which statement best describes a Db2 instance?', o: ['A single table space', 'An environment with its own engine processes and DBM configuration that can host several databases', 'A backup image', 'A copy of the catalog'], a: 1, why: 'An instance owns the engine processes and the database manager configuration; databases live inside it.' },
      { q: 'What is the name of the main Db2 engine process on Linux?', o: ['db2bp', 'db2sysc', 'db2agent', 'db2top'], a: 1, why: 'db2sysc is the engine; db2bp is the CLP back-end; db2agent is one of the EDUs inside the engine.' },
      { q: 'Which EDU writes changed pages from the buffer pool to disk?', o: ['Page cleaner (db2pclnr)', 'Prefetcher', 'Log writer', 'Deadlock detector'], a: 0, why: 'Page cleaners write dirty pages asynchronously; prefetchers read ahead; the log writer writes the log.' },
      { q: 'Why does Db2 write to the transaction log before writing data pages?', o: ['To compress data', 'Write-ahead logging guarantees recoverability and atomic commits', 'To reduce memory usage', 'Because pages are encrypted'], a: 1, why: 'Write-ahead logging means committed work can be redone and uncommitted work undone after a failure.' },
      { q: 'What is the smallest unit of I/O in Db2 storage?', o: ['Extent', 'Container', 'Page', 'Table space'], a: 2, why: 'A page (4/8/16/32 KB) is the I/O unit; extents group pages; containers provide space.' },
      { q: 'Where do you find a list of tables and their table spaces inside a database?', o: ['The SYSCAT catalog views', 'db2diag.log', 'The registry', 'The DBM CFG'], a: 0, why: 'SYSCAT.TABLES (and SYSCAT.TABLESPACES) describe objects in the database catalog.' }
    ],
    resources: [R.docs, R.db2, R.community, { title: 'Db2 Community Edition on Docker (image name)', url: 'https://www.ibm.com/products/db2', note: 'Image: icr.io/db2_community/db2 – see INSTALL guide in the download.' }]
  });

  /* ===================== MODULE 2 ===================== */
  C.add({
    n: 2, id: 'm2', icon: '⚙️', title: 'Instances & Configuration', minutes: 60,
    summary: 'Create and manage instances, understand the configuration hierarchy (registry → DBM CFG → DB CFG) and read the diagnostic log.',
    objectives: ['Use db2icrt/db2idrop/db2ilist/db2start/db2stop', 'Change registry variables with db2set', 'Update DBM CFG and know which changes need a restart', 'Read db2diag output and tune DIAGLEVEL'],
    lessons: [
      {
        id: 'l1', title: 'Instance management commands', html: `
<table><tr><th>Command</th><th>Run as</th><th>Purpose</th></tr>
<tr><td><code>db2icrt -u db2fenc1 db2inst1</code></td><td>root</td><td>Create an instance (owner <code>db2inst1</code>, fenced user <code>db2fenc1</code>)</td></tr>
<tr><td><code>db2idrop db2inst1</code></td><td>root</td><td>Drop an instance (databases must be dropped/uncatalogued first)</td></tr>
<tr><td><code>db2iupdt db2inst1</code></td><td>root</td><td>Update an instance after applying a fix pack</td></tr>
<tr><td><code>db2ilist</code></td><td>any</td><td>List instances</td></tr>
<tr><td><code>db2start</code> / <code>db2stop</code></td><td>instance owner</td><td>Start / stop the database manager</td></tr>
<tr><td><code>db2stop force</code></td><td>instance owner</td><td>Force off all applications, then stop</td></tr>
<tr><td><code>db2level</code></td><td>any</td><td>Show product version and fix pack</td></tr></table>
<div class="callout warn"><b>Watch out:</b> <code>db2stop</code> fails with <code>SQL1025N</code> if databases are still active. Disconnect applications (<code>FORCE APPLICATION ALL</code>) or use <code>db2stop force</code>.</div>
<p>Try the stop/start cycle in the terminal – and see what happens when you connect to a database while the instance is down (<code>SQL1032N</code>).</p>
<pre class="code">db2start
db2stop
db2 connect to sample</pre>` },
      {
        id: 'l2', title: 'The configuration hierarchy', html: `
<p>Db2 reads settings from several levels. Knowing <i>where</i> a setting lives is half of administration.</p>
<table><tr><th>Level</th><th>Scope</th><th>Examples</th><th>Command</th></tr>
<tr><td>Environment variables</td><td>Process</td><td><code>DB2INSTANCE</code>, <code>DB2DBDFT</code></td><td><code>export</code></td></tr>
<tr><td>Registry</td><td>Instance / global</td><td><code>DB2COMM</code>, <code>DB2AUTOSTART</code></td><td><code>db2set</code></td></tr>
<tr><td>Database manager cfg</td><td>Instance</td><td><code>DIAGLEVEL</code>, <code>SVCENAME</code>, <code>AUTHENTICATION</code>, <code>SYSADM_GROUP</code></td><td><code>get/update dbm cfg</code></td></tr>
<tr><td>Database cfg</td><td>One database</td><td><code>LOGFILSIZ</code>, <code>LOCKTIMEOUT</code>, <code>LOGARCHMETH1</code></td><td><code>get/update db cfg for &lt;db&gt;</code></td></tr></table>
<h4>Dynamic vs. deferred</h4>
<p>Many parameters take effect immediately. Others only after the instance is restarted (DBM CFG) or the database is deactivated and reactivated (DB CFG). Db2 tells you with a warning:</p>
<pre class="code-plain">SQL1362W  One or more of the parameters submitted for immediate modification were
          not changed dynamically ... Server changes will not be effective until the next DB2START.
SQL1363W  ... the database must be shutdown and reactivated ...</pre>
<h4>Making the server reachable</h4>
<p>For remote clients, set the communication protocol and port:</p>
<pre class="code">db2set DB2COMM=TCPIP
db2 update dbm cfg using SVCENAME 50000</pre>
<p>Then restart (<code>db2stop</code> / <code>db2start</code>). The default Db2 port is <b>50000</b>.</p>
<h4>Authentication</h4>
<p><code>AUTHENTICATION</code> (DBM CFG) decides <i>where</i> passwords are checked: <code>SERVER</code> (default, on the server OS), <code>CLIENT</code>, <code>SERVER_ENCRYPT</code>, <code>KERBEROS</code>, <code>GSSPLUGIN</code>… Prefer encrypted options in production.</p>` },
      {
        id: 'l3', title: 'Diagnostics basics: db2diag.log and DIAGLEVEL', html: `
<p>Db2 writes problems and notable events to the <b>diagnostic log</b> <code>db2diag.log</code> in <code>DIAGPATH</code>. You read it with the <code>db2diag</code> tool, which can filter by level, time and text.</p>
<table><tr><th>DIAGLEVEL</th><th>Captures</th></tr>
<tr><td>0</td><td>Nothing</td></tr><tr><td>1</td><td>Severe errors only</td></tr><tr><td>2</td><td>All errors</td></tr><tr><td>3 (default)</td><td>All errors and warnings</td></tr><tr><td>4</td><td>Errors, warnings and informational messages (use temporarily while troubleshooting)</td></tr></table>
<pre class="code">db2diag
db2diag -l Error,Severe
db2diag -g "msg:=ADM"</pre>
<p>Each record has a <b>timestamp</b>, <b>LEVEL</b>, the <b>process/instance/database</b>, a <b>FUNCTION</b> (where in the engine) and a <b>MESSAGE</b> with a code such as <code>ADM7513W</code>. Message prefixes: <code>ADM</code> administration, <code>SQL</code> SQL/utility, <code>DBI</code> install, <code>DB2</code> CLP.</p>
<div class="callout tip">Set <code>DIAGLEVEL 4</code> while reproducing a problem, then set it back to 3 — level 4 makes the log grow quickly.</div>` }
    ],
    labs: [{
      id: 'lab1', title: 'Lab 2.1 – Configure the instance', level: 'Beginner', terminals: 1,
      goal: 'Raise the diagnostic level, set the service port, change the registry and restart the instance so the changes apply.',
      setup: ['db2start'],
      steps: [
        { t: 'Raise the diagnostic level to 4.', cmd: 'db2 update dbm cfg using DIAGLEVEL 4' },
        { t: 'Set the service port (note the SQL1362W warning – a restart is needed).', cmd: 'db2 update dbm cfg using SVCENAME 50000' },
        { t: 'Enable TCP/IP communications in the registry.', cmd: 'db2set DB2COMM=TCPIP' },
        { t: 'Restart the instance.', cmd: 'db2stop\ndb2start' },
        { t: 'Verify with grep, then read the diagnostic log.', cmd: 'db2 get dbm cfg | grep -E "DIAGLEVEL|SVCENAME"\ndb2diag' }
      ],
      hints: ['db2stop only works when nothing is connected.', 'DB2COMM=TCPIP has no spaces around the equals sign.'],
      checks: [
        { d: 'DIAGLEVEL is 4', f: (S) => S.sim.inst.dbm.DIAGLEVEL === '4' },
        { d: 'SVCENAME is 50000', f: (S) => S.sim.inst.dbm.SVCENAME === '50000' },
        { d: 'DB2COMM registry variable is TCPIP', f: (S) => S.sim.inst.registry.DB2COMM === 'TCPIP' },
        { d: 'Instance was stopped and restarted (it is running)', f: (S) => S.sim.inst.started && S.ran(/^db2stop/) },
        { d: 'You read the diagnostic log', f: (S) => S.ran(/^db2diag/) }
      ],
      solution: ['db2 update dbm cfg using DIAGLEVEL 4', 'db2 update dbm cfg using SVCENAME 50000', 'db2set DB2COMM=TCPIP', 'db2stop', 'db2start', 'db2 get dbm cfg | grep -E "DIAGLEVEL|SVCENAME"', 'db2diag']
    }],
    quiz: [
      { q: 'Which command lists registry variables that are set?', o: ['db2level', 'db2set', 'db2ilist', 'db2pd'], a: 1, why: 'db2set shows and sets registry variables such as DB2COMM.' },
      { q: 'You change SVCENAME in the DBM CFG. When does it take effect?', o: ['Immediately', 'After the next db2start', 'After a database backup', 'After a REORG'], a: 1, why: 'SVCENAME is not dynamic – SQL1362W tells you the new value applies at the next db2start.' },
      { q: 'Which DIAGLEVEL logs errors, warnings and informational messages?', o: ['1', '2', '3', '4'], a: 3, why: '4 is the most verbose; 3 (default) is errors and warnings.' },
      { q: 'db2stop returns SQL1025N. What does it mean?', o: ['Instance already stopped', 'Databases are still active/applications connected', 'Out of disk space', 'License expired'], a: 1, why: 'Use FORCE APPLICATION ALL or db2stop force.' },
      { q: 'Which tool filters and formats db2diag.log?', o: ['db2look', 'db2diag', 'db2expln', 'db2ckbkp'], a: 1, why: 'db2diag filters by level, time and text; db2look extracts DDL; db2expln shows access plans.' },
      { q: 'Where is LOCKTIMEOUT configured?', o: ['Registry', 'DBM CFG', 'DB CFG', 'Operating-system file'], a: 2, why: 'LOCKTIMEOUT is a database configuration parameter (get/update db cfg for <db>).' }
    ],
    resources: [R.docs, { title: 'Look up: Configuration parameters summary', url: C.search('configuration parameters summary'), note: 'IBM Docs search – list of all DBM and DB cfg parameters.' }, { title: 'Look up: db2diag tool', url: C.search('db2diag diagnostic log analysis tool'), note: 'Filtering options and examples.' }, R.community]
  });

  /* ===================== MODULE 3 ===================== */
  C.add({
    n: 3, id: 'm3', icon: '🗄️', title: 'Creating & Managing Databases', minutes: 70,
    summary: 'CREATE DATABASE options (some are permanent!), the database directory, connecting, activating and the key database configuration parameters.',
    objectives: ['Create a database with automatic storage and choose page size/code set', 'Catalog aliases and read the database directory', 'Connect, activate, deactivate; list applications and force them off', 'Read and update the database configuration'],
    lessons: [
      {
        id: 'l1', title: 'Creating a database – choices you cannot undo', html: `
<pre class="code">db2 create database sample
db2 create database train automatic storage yes pagesize 8192
db2 create database secure restrictive</pre>
<p><code>CREATE DATABASE</code> creates the catalog, three default table spaces, the default buffer pool <code>IBMDEFAULTBP</code>, the transaction log files and the configuration. Some options are <b>permanent</b>:</p>
<table><tr><th>Option</th><th>Default</th><th>Changeable later?</th></tr>
<tr><td>Code set (<code>USING CODESET</code>)</td><td>UTF-8</td><td><b>No</b></td></tr>
<tr><td>Territory</td><td>US</td><td><b>No</b></td></tr>
<tr><td>Collation</td><td>IDENTITY (UTF-8 binary)</td><td><b>No</b></td></tr>
<tr><td>Default page size (<code>PAGESIZE</code>)</td><td>4 KB</td><td><b>No</b></td></tr>
<tr><td>Automatic storage</td><td>YES</td><td>Storage paths can be added later</td></tr>
<tr><td><code>RESTRICTIVE</code></td><td>off</td><td>Governs default privileges granted to PUBLIC at creation</td></tr></table>
<h4>What you get</h4>
<ul><li><b>SYSCATSPACE</b> – system catalog</li><li><b>TEMPSPACE1</b> – system temporary (sorts, joins)</li><li><b>USERSPACE1</b> – default for your tables</li></ul>
<div class="callout tip">Choose UTF-8 and think about the page size up front: wide tables (many/long columns) need 8, 16 or 32 KB pages, and you cannot change the database default afterwards. You <i>can</i> add table spaces with other page sizes (Module 4).</div>
<p>Database names are limited to <b>8 characters</b>, start with a letter, and must be unique in the system database directory.</p>` },
      {
        id: 'l2', title: 'Directories, connecting and activating', html: `
<p>Db2 keeps a <b>system database directory</b> of every database the instance knows about, each with a <i>name</i> and an <i>alias</i>. Clients connect by alias.</p>
<pre class="code">db2 list db directory
db2 catalog database train as trn
db2 uncatalog database trn</pre>
<h4>Connecting</h4>
<pre class="code">db2 connect to sample
db2 connect to sample user bob using Passw0rd
db2 get connection state
db2 connect reset
db2 terminate</pre>
<ul><li><code>CONNECT RESET</code> ends the connection (commits first). <code>TERMINATE</code> also stops the CLP back-end process.</li>
<li>A database is <b>activated</b> automatically on the first connection and deactivated after the last disconnect – so memory (buffer pools!) is rebuilt every time. For production run <code>ACTIVATE DATABASE</code> so the buffer pool stays warm.</li></ul>
<pre class="code">db2 activate database sample
db2 list active databases
db2 list applications
db2 deactivate database sample</pre>
<h4>Getting applications off</h4>
<pre class="code">db2 list applications
db2 force application all
db2 force application (42)</pre>
<p>Maintenance tasks such as an <b>offline backup</b> need that nobody is connected and the database is not explicitly activated, otherwise you get <code>SQL1035N The database is currently in use</code>.</p>` },
      {
        id: 'l3', title: 'Database configuration (DB CFG)', html: `
<pre class="code">db2 get db cfg for sample
db2 get db cfg for sample | grep -i log
db2 update db cfg for sample using LOGFILSIZ 4096 LOGPRIMARY 10
db2 reset db cfg for sample</pre>
<table><tr><th>Parameter</th><th>Meaning</th><th>Notes</th></tr>
<tr><td><code>LOGFILSIZ</code>, <code>LOGPRIMARY</code>, <code>LOGSECOND</code></td><td>Size (4 KB pages) and number of transaction log files</td><td>Need reactivation to apply</td></tr>
<tr><td><code>LOGARCHMETH1</code></td><td>Where full log files are archived. <code>OFF</code> = circular logging</td><td>Enables rollforward recovery (Module 8)</td></tr>
<tr><td><code>LOCKTIMEOUT</code></td><td>Seconds to wait for a lock. <code>-1</code> = wait forever</td><td>Set 30–60 for OLTP</td></tr>
<tr><td><code>CUR_COMMIT</code></td><td>Readers see last committed data instead of waiting</td><td>Default ON for new databases</td></tr>
<tr><td><code>SELF_TUNING_MEM</code></td><td>Automatic memory distribution</td><td>Default ON</td></tr>
<tr><td><code>TRACKMOD</code></td><td>Track changed pages (needed for incremental backup)</td><td>Default NO in this course</td></tr>
<tr><td><code>AUTO_MAINT</code>, <code>AUTO_RUNSTATS</code></td><td>Automatic maintenance</td><td>Leave ON unless you have a reason</td></tr></table>
<div class="callout warn">Changing <code>LOGARCHMETH1</code> from OFF puts the database into <b>BACKUP PENDING</b> – nobody can connect until you take a full offline backup. You will meet this in Module 8.</div>` }
    ],
    labs: [{
      id: 'lab1', title: 'Lab 3.1 – Create and manage a database', level: 'Beginner', terminals: 1,
      goal: 'Create TRAIN with an 8 KB page size, inspect it, give it an alias, then activate and deactivate it.',
      setup: ['db2start'],
      steps: [
        { t: 'Create the database with an 8 KB default page size.', cmd: 'db2 create database TRAIN automatic storage yes pagesize 8192' },
        { t: 'Connect and look at the default table spaces and their page sizes.', cmd: 'db2 connect to TRAIN\ndb2 list tablespaces show detail\ndb2 "select tbspace, pagesize from syscat.tablespaces"' },
        { t: 'Disconnect, then catalog an alias <b>TRN</b> for TRAIN.', cmd: 'db2 connect reset\ndb2 catalog database TRAIN as TRN' },
        { t: 'Activate the database, list active databases, then deactivate it.', cmd: 'db2 activate database TRAIN\ndb2 list active databases\ndb2 deactivate database TRAIN' }
      ],
      hints: ['Remember: connect reset before cataloging/deactivating.', 'Check the alias with db2 list db directory.'],
      checks: [
        { d: 'Database TRAIN exists with 8192-byte page size', f: (S) => S.db('TRAIN') && S.db('TRAIN').pagesize === 8192 },
        { d: 'Alias TRN points to TRAIN', f: (S) => S.sim.aliases.TRN === 'TRAIN' },
        { d: 'You activated the database', f: (S) => S.ran(/activate (db|database) train/i) },
        { d: 'You listed active databases', f: (S) => S.ran(/list active databases/i) },
        { d: 'Database is deactivated again', f: (S) => S.db('TRAIN') && !S.db('TRAIN').activated && S.ran(/deactivate (db|database) train/i) }
      ],
      solution: ['db2 create database TRAIN automatic storage yes pagesize 8192', 'db2 connect to TRAIN', 'db2 list tablespaces show detail', 'db2 "select tbspace, pagesize from syscat.tablespaces"', 'db2 connect reset', 'db2 catalog database TRAIN as TRN', 'db2 activate database TRAIN', 'db2 list active databases', 'db2 deactivate database TRAIN']
    }],
    quiz: [
      { q: 'Which database characteristic can NOT be changed after creation?', o: ['Buffer pool size', 'Default page size and code set', 'LOCKTIMEOUT', 'Number of table spaces'], a: 1, why: 'Code set, territory, collation and the database default page size are fixed at creation.' },
      { q: 'What is the maximum length of a database name?', o: ['4', '8', '18', '128'], a: 1, why: 'Database names are limited to 8 characters.' },
      { q: 'Which table space holds your tables by default?', o: ['SYSCATSPACE', 'TEMPSPACE1', 'USERSPACE1', 'SYSTOOLSPACE'], a: 2, why: 'USERSPACE1 is the default for user tables; SYSCATSPACE is the catalog.' },
      { q: 'Why run ACTIVATE DATABASE in production?', o: ['It encrypts the database', 'It keeps the database (and buffer pools) in memory when the last application disconnects', 'It starts the instance', 'It creates a backup'], a: 1, why: 'Without it the database is deactivated after the last disconnect, losing the warm buffer pool.' },
      { q: 'An offline backup fails with SQL1035N. Most likely cause?', o: ['Table space is full', 'Applications are connected or the database is activated', 'Wrong password', 'Disk is read-only'], a: 1, why: 'Offline backup requires the database to be inactive – force applications and deactivate.' },
      { q: 'Which command removes your CLP connection and stops the CLP back-end process?', o: ['connect reset', 'terminate', 'db2stop', 'deactivate database'], a: 1, why: 'CONNECT RESET disconnects; TERMINATE also ends the back-end process.' }
    ],
    resources: [R.docs, { title: 'Look up: CREATE DATABASE command', url: C.search('CREATE DATABASE command'), note: 'All options including storage groups and encryption.' }, { title: 'Look up: Database configuration parameters', url: C.search('database configuration parameters'), note: 'Reference for every DB CFG parameter.' }, R.redbooks]
  });
})();
