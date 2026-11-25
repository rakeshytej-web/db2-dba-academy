(function () {
  const C = (typeof window !== 'undefined' ? window : global).COURSE; const R = C.res;
  const SHOP = ['db2start', 'db2 create database shop', 'db2 connect to shop'];

  /* ===================== MODULE 4 ===================== */
  C.add({
    n: 4, id: 'm4', icon: '💾', title: 'Storage: Buffer Pools & Table Spaces', minutes: 90,
    summary: 'How Db2 caches and stores data: buffer pools, page sizes, SMS/DMS/automatic-storage table spaces, extents, prefetching, and monitoring capacity.',
    objectives: ['Create buffer pools and match them to table-space page sizes', 'Choose between automatic storage, DMS and SMS table spaces', 'Create regular, large and temporary table spaces', 'Compute and improve the buffer pool hit ratio', 'Monitor table-space usage'],
    lessons: [
      {
        id: 'l1', title: 'Buffer pools', html: `
<p>A <b>buffer pool</b> is the area of memory where Db2 caches table and index pages. When a query needs a page, Db2 looks in the buffer pool first (a <i>logical read</i>). If it is not there, Db2 reads it from disk (a <i>physical read</i>) – thousands of times slower.</p>
<pre class="code">db2 create bufferpool bp8k size 5000 pagesize 8k
db2 alter bufferpool ibmdefaultbp size automatic
db2 "select bpname, npages, pagesize from syscat.bufferpools"
db2 drop bufferpool bp8k</pre>
<h4>Rules that cause real errors</h4>
<ul><li>A table space can only use a buffer pool with the <b>same page size</b>.</li>
<li>You cannot drop a buffer pool that a table space still uses (<code>SQL0478N</code>).</li>
<li><code>IBMDEFAULTBP</code> (4 KB or the database page size) always exists.</li>
<li><code>SIZE AUTOMATIC</code> lets the self-tuning memory manager (STMM) resize it.</li></ul>
<h4>Hit ratio – the key health indicator</h4>
<pre class="code-plain">hit ratio % = (1 − (physical reads / logical reads)) × 100
          (data + index reads combined)</pre>
<p>OLTP systems typically aim for <b>&gt; 95%</b> overall (index ≥ 98%). Query it from the monitor functions:</p>
<pre class="code">db2 "select bp_name, pool_data_l_reads, pool_data_p_reads from table(mon_get_bufferpool(null,-2)) as t"
db2 "select * from sysibmadm.bp_hitratio"</pre>
<div class="callout tip"><b>Rule of thumb:</b> low hit ratio + small buffer pool → enlarge it (if memory allows). Low hit ratio + huge table scans → fix the SQL/indexes instead (Module 11). Separate buffer pools for hot small tables and big scan-heavy tables can stop scans from flushing useful pages.</div>
<div class="callout note"><b>Simulator note:</b> The simulator models caching in a simplified way (page counts estimated from row counts), enough to show the effect of buffer pool size on hit ratio.</div>` },
      {
        id: 'l2', title: 'Table spaces: SMS, DMS and automatic storage', html: `
<p>A <b>table space</b> maps tables and indexes to physical storage. Choose the management type:</p>
<table><tr><th>Type</th><th>Who manages space</th><th>Use today</th></tr>
<tr><td><b>Automatic storage</b> (DMS or SMS underneath)</td><td>Db2, from the database's <i>storage paths</i>; grows automatically</td><td><b>Default and recommended</b></td></tr>
<tr><td>DMS (database-managed)</td><td>You specify FILE/DEVICE containers and sizes</td><td>Special cases</td></tr>
<tr><td>SMS (system-managed)</td><td>The OS file system, one file per object</td><td>Mostly temporary spaces; deprecated for permanent data</td></tr></table>
<h4>Content types</h4>
<ul><li><b>REGULAR / LARGE</b> – permanent data (LARGE is the default in new databases)</li><li><b>SYSTEM TEMPORARY</b> – sorts, joins (needs one per page size you use)</li><li><b>USER TEMPORARY</b> – declared global temporary tables</li></ul>
<h4>Creating table spaces</h4>
<pre class="code">db2 create tablespace ts_data managed by automatic storage
db2 create tablespace ts_wide pagesize 8k managed by automatic storage bufferpool bp8k
db2 create large tablespace ts_big managed by automatic storage initialsize 100 m maxsize 10 g
db2 create user temporary tablespace ts_utemp managed by automatic storage</pre>
<h4>Important attributes</h4>
<table><tr><th>Attribute</th><th>Meaning</th></tr>
<tr><td><code>PAGESIZE</code></td><td>4/8/16/32 KB. Must match the buffer pool. Determines max row length (4 KB pages: 4005 bytes; 8 KB: 8101; 16 KB: 16293; 32 KB: 32677).</td></tr>
<tr><td><code>EXTENTSIZE</code></td><td>Pages allocated at a time (default from <code>DFT_EXTENT_SZ</code>).</td></tr>
<tr><td><code>PREFETCHSIZE</code></td><td>Pages read ahead for scans. <code>AUTOMATIC</code> is best.</td></tr>
<tr><td><code>BUFFERPOOL</code></td><td>Which buffer pool caches this table space.</td></tr>
<tr><td><code>AUTORESIZE / MAXSIZE / INCREASESIZE</code></td><td>How an automatic-storage space grows.</td></tr></table>
<div class="callout warn">A table whose row length exceeds the page limit fails with <code>SQL0670N</code>. The fix is a table space with a larger page size (plus a matching buffer pool) – you will do this in Lab 4.1.</div>
<h4>Why several table spaces?</h4>
<p>Separate table spaces for data/indexes/LOBs, hot vs. cold tables, or different page sizes give you finer control over buffer pools, backup (you can back up a single table space) and recovery.</p>` },
      {
        id: 'l3', title: 'Monitoring capacity and container layout', html: `
<pre class="code">db2 list tablespaces show detail
db2 list tablespace containers for 2 show detail
db2 "select tbsp_name, tbsp_total_pages, tbsp_used_pages, tbsp_free_pages from table(mon_get_tablespace(null,-2)) as t"
db2 "select tbsp_name, tbsp_utilization_percent from sysibmadm.tbsp_utilization"
db2pd -db sample -tablespaces</pre>
<table><tr><th>Field</th><th>Meaning</th></tr>
<tr><td>Total pages</td><td>All pages in all containers</td></tr><tr><td>Useable pages</td><td>Total minus overhead (extent maps etc.)</td></tr>
<tr><td>Used pages</td><td>Pages allocated to objects</td></tr><tr><td>High water mark</td><td>Highest page ever allocated – free space below it is only reusable inside the table space</td></tr>
<tr><td>State</td><td><code>0x0000</code> = Normal. Others: backup pending (0x0020), rollforward pending (0x0080) …</td></tr></table>
<p>For automatic-storage table spaces, Db2 grows containers until <code>MAXSIZE</code> or the file system is full. Watch both. To lower a high water mark, reorganise tables and use <code>ALTER TABLESPACE … REDUCE</code> (concept; run on a real server).</p>
<h4>Dropping and renaming</h4>
<p><code>DROP TABLESPACE</code> drops every table in it – double-check with <code>SYSCAT.TABLES</code> first. System table spaces cannot be dropped.</p>` }
    ],
    labs: [
      {
        id: 'lab1', title: 'Lab 4.1 – Table space for a wide table', level: 'Intermediate', terminals: 1,
        goal: 'Hit the row-length limit on a 4 KB page, then solve it with an 8 KB buffer pool and table space.',
        setup: SHOP,
        steps: [
          { t: 'Try to create a table whose row is longer than 4005 bytes. It must fail with <code>SQL0670N</code>.', cmd: 'db2 "create table wide (id int, a varchar(3000), b varchar(3000))"' },
          { t: 'Create an 8 KB buffer pool, then a matching 8 KB automatic-storage table space that uses it.', cmd: 'db2 create bufferpool bp8k size 1000 pagesize 8k\ndb2 create tablespace ts_wide pagesize 8k managed by automatic storage bufferpool bp8k' },
          { t: 'Create the table again, this time <b>IN ts_wide</b>.', cmd: 'db2 "create table wide (id int, a varchar(3000), b varchar(3000)) in ts_wide"' },
          { t: 'Verify the layout using the catalog.', cmd: 'db2 "select tbspace, pagesize, bufferpool from syscat.tablespaces"\ndb2 "select tabname, tbspace from syscat.tables where tabname = \'WIDE\'"' }
        ],
        hints: ['Buffer pool first, table space second, table third.', 'A tablespace and its buffer pool must have the same PAGESIZE.'],
        checks: [
          { d: 'You triggered SQL0670N (row too long)', f: (S) => S.failed('SQL0670N') },
          { d: 'Buffer pool BP8K exists with 8 KB pages', f: (S) => S.db('SHOP').bufferpools.BP8K && S.db('SHOP').bufferpools.BP8K.pagesize === 8192 },
          { d: 'Table space TS_WIDE uses BP8K', f: (S) => S.db('SHOP').tablespaces.TS_WIDE && S.db('SHOP').tablespaces.TS_WIDE.bp === 'BP8K' },
          { d: 'Table WIDE lives in TS_WIDE', f: (S) => S.db('SHOP').tables.WIDE && S.db('SHOP').tables.WIDE.ts === 'TS_WIDE' }
        ],
        solution: ['db2 "create table wide (id int, a varchar(3000), b varchar(3000))"', 'db2 create bufferpool bp8k size 1000 pagesize 8k', 'db2 create tablespace ts_wide pagesize 8k managed by automatic storage bufferpool bp8k', 'db2 "create table wide (id int, a varchar(3000), b varchar(3000)) in ts_wide"', 'db2 "select tbspace, pagesize, bufferpool from syscat.tablespaces"', 'db2 "select tabname, tbspace from syscat.tables where tabname = \'WIDE\'"']
      },
      {
        id: 'lab2', title: 'Lab 4.2 – Tune a buffer pool', level: 'Intermediate', terminals: 1,
        goal: 'Create a deliberately tiny buffer pool, measure a terrible hit ratio, then enlarge it and measure again.',
        setup: SHOP,
        steps: [
          { t: 'Create a 20-page buffer pool, a table space that uses it, and a table in that table space.', cmd: 'db2 create bufferpool bp_small size 20 pagesize 4k\ndb2 create tablespace ts_small managed by automatic storage bufferpool bp_small\ndb2 "create table big (id int, pad char(60)) in ts_small"' },
          { t: 'Insert 5000 rows with a recursive query.', cmd: 'db2 "insert into big with r(n) as (select 1 from sysibm.sysdummy1 union all select n+1 from r where n < 5000) select n, \'x\' from r"' },
          { t: 'Run a table scan twice (the table is bigger than the buffer pool, so every scan goes to disk).', cmd: 'db2 "select count(*) from big where pad = \'y\'"\ndb2 "select count(*) from big where pad = \'y\'"' },
          { t: 'Measure: logical vs. physical reads and the hit ratio.', cmd: 'db2 "select bp_name, pool_data_l_reads, pool_data_p_reads from table(mon_get_bufferpool(null,-2)) as t where bp_name = \'BP_SMALL\'"\ndb2 "select bp_name, total_hit_ratio_percent from sysibmadm.bp_hitratio"' },
          { t: 'Enlarge the buffer pool to 1000 pages, run the scan three more times and measure again.', cmd: 'db2 alter bufferpool bp_small size 1000\ndb2 "select count(*) from big where pad = \'y\'"\ndb2 "select count(*) from big where pad = \'y\'"\ndb2 "select count(*) from big where pad = \'y\'"\ndb2 "select * from sysibmadm.bp_hitratio"' }
        ],
        hints: ['Hit ratio = 1 − physical/logical. The first scan after the resize is "cold"; later scans are warm.'],
        checks: [
          { d: 'BP_SMALL was enlarged to at least 500 pages', f: (S) => S.db('SHOP').bufferpools.BP_SMALL && S.db('SHOP').bufferpools.BP_SMALL.size >= 500 },
          { d: 'Table BIG has 5000 rows', f: (S) => S.rows(S.db('SHOP'), 'select count(*) from big')[0][0] === 5000 },
          { d: 'You queried the buffer pool monitor data', f: (S) => S.ran(/mon_get_bufferpool|bp_hitratio/i) },
          { d: 'BP_SMALL hit ratio is now above 30%', f: (S) => { const s = S.db('SHOP').bpStats.BP_SMALL; return s && s.dl > 0 && (1 - s.dp / s.dl) > 0.3; } }
        ],
        solution: ['db2 create bufferpool bp_small size 20 pagesize 4k', 'db2 create tablespace ts_small managed by automatic storage bufferpool bp_small', 'db2 "create table big (id int, pad char(60)) in ts_small"', 'db2 "insert into big with r(n) as (select 1 from sysibm.sysdummy1 union all select n+1 from r where n < 5000) select n, \'x\' from r"', 'db2 "select count(*) from big where pad = \'y\'"', 'db2 "select count(*) from big where pad = \'y\'"', 'db2 "select bp_name, pool_data_l_reads, pool_data_p_reads from table(mon_get_bufferpool(null,-2)) as t where bp_name = \'BP_SMALL\'"', 'db2 "select bp_name, total_hit_ratio_percent from sysibmadm.bp_hitratio"', 'db2 alter bufferpool bp_small size 1000', 'db2 "select count(*) from big where pad = \'y\'"', 'db2 "select count(*) from big where pad = \'y\'"', 'db2 "select count(*) from big where pad = \'y\'"', 'db2 "select * from sysibmadm.bp_hitratio"']
      }
    ],
    quiz: [
      { q: 'A table space is created with PAGESIZE 8K. What must be true of its buffer pool?', o: ['Any buffer pool works', 'It must also have an 8 KB page size', 'It must be AUTOMATIC', 'It must be IBMDEFAULTBP'], a: 1, why: 'Page sizes of table space and buffer pool must match.' },
      { q: 'Formula for the buffer pool hit ratio?', o: ['logical / physical', '(1 − physical/logical) × 100', 'physical × logical', 'writes / reads'], a: 1, why: 'The share of page requests satisfied from memory.' },
      { q: 'Which table-space management type is recommended for new permanent data?', o: ['SMS', 'DMS with raw devices', 'Automatic storage', 'None – use the catalog space'], a: 2, why: 'Automatic storage lets Db2 manage and grow containers.' },
      { q: 'A CREATE TABLE fails with SQL0670N. What is the correct fix?', o: ['Restart Db2', 'Create the table in a table space with a larger page size (and matching buffer pool)', 'Run RUNSTATS', 'Increase LOCKTIMEOUT'], a: 1, why: 'The row length exceeds the limit for the page size (4005 bytes on a 4 KB page).' },
      { q: 'Why does DROP BUFFERPOOL fail with SQL0478N?', o: ['The pool is too large', 'A table space still uses it', 'The instance is stopped', 'Only SYSADM may drop pools'], a: 1, why: 'Reassign or drop the dependent table spaces first.' },
      { q: 'Table-space state 0x0000 means…', o: ['Backup pending', 'Normal', 'Rollforward pending', 'Offline'], a: 1, why: 'Zero means no special state; 0x0020 backup pending, 0x0080 rollforward pending.' }
    ],
    resources: [R.docs, { title: 'Look up: CREATE TABLESPACE statement', url: C.search('CREATE TABLESPACE statement'), note: 'Complete syntax and options.' }, { title: 'Look up: Buffer pool hit ratio', url: C.search('buffer pool hit ratio'), note: 'Monitoring elements and formulas.' }, R.redbooks]
  });

  /* ===================== MODULE 5 ===================== */
  C.add({
    n: 5, id: 'm5', icon: '🧱', title: 'Tables, Indexes & Database Objects', minutes: 80,
    summary: 'Design tables with the right data types and constraints, add indexes that help (and know when they hurt), and explore views, schemas and the catalog.',
    objectives: ['Create tables with PK, FK, UNIQUE, CHECK and identity columns', 'Use schemas and views', 'Design and create indexes, including unique and composite', 'Extract DDL with db2look and query the catalog'],
    lessons: [
      {
        id: 'l1', title: 'Schemas, data types and constraints', html: `
<p>Objects live in <b>schemas</b> (namespaces). An unqualified name uses your authorization ID as the schema, so <code>emp</code> for user <code>db2inst1</code> means <code>DB2INST1.EMP</code>.</p>
<pre class="code">db2 create schema hr
db2 "create table hr.dept (deptno int not null primary key, deptname varchar(30) not null)"</pre>
<h4>Common data types</h4>
<table><tr><th>Type</th><th>Use</th></tr>
<tr><td><code>SMALLINT / INTEGER / BIGINT</code></td><td>Whole numbers (2/4/8 bytes)</td></tr>
<tr><td><code>DECIMAL(p,s)</code></td><td>Exact numbers – money. <b>Never use floating point for currency.</b></td></tr>
<tr><td><code>CHAR(n) / VARCHAR(n)</code></td><td>Fixed / variable text</td></tr>
<tr><td><code>DATE / TIME / TIMESTAMP</code></td><td>Temporal data</td></tr>
<tr><td><code>CLOB / BLOB</code></td><td>Large objects (stored separately from the row)</td></tr>
<tr><td><code>BOOLEAN</code></td><td>true/false</td></tr></table>
<h4>Constraints</h4>
<pre class="code">db2 "create table hr.emp (empno int not null primary key,
        name varchar(40) not null,
        deptno int,
        salary decimal(9,2) check (salary > 0),
        foreign key (deptno) references hr.dept(deptno))"</pre>
<table><tr><th>Constraint</th><th>Violation error</th></tr>
<tr><td>NOT NULL</td><td><code>SQL0407N</code> (SQLSTATE 23502)</td></tr>
<tr><td>PRIMARY KEY / UNIQUE</td><td><code>SQL0803N</code> (23505)</td></tr>
<tr><td>FOREIGN KEY (insert/update child)</td><td><code>SQL0530N</code> (23503)</td></tr>
<tr><td>FOREIGN KEY (delete parent)</td><td><code>SQL0532N</code> (23504)</td></tr>
<tr><td>CHECK</td><td><code>SQL0545N</code> (23513)</td></tr></table>
<h4>Identity and defaults</h4>
<pre class="code">create table audit (id integer not null generated always as identity, msg varchar(100), at timestamp default current timestamp)</pre>
<h4>Changing a table</h4>
<p><code>ALTER TABLE … ADD COLUMN</code> is instant. <code>DROP COLUMN</code> puts the table into <b>REORG-pending</b> state (<code>SQL0668N</code> reason 7) until you run <code>REORG TABLE</code>.</p>
<div class="callout note"><b>Simulator note:</b> The simulator executes SQL on an embedded SQLite engine. Standard SQL (joins, CTEs, constraints, identity) works; Db2-only objects such as sequences, stored procedures and MQTs are explained but not executable here – practise them on a real instance.</div>` },
      {
        id: 'l2', title: 'Indexes', html: `
<p>An <b>index</b> is a B-tree that lets Db2 find rows without scanning the whole table. Primary key and UNIQUE constraints create a unique index automatically.</p>
<pre class="code">db2 "create index hr.ix_emp_dept on hr.emp (deptno)"
db2 "create unique index ix_emp_name on hr.emp (name)"
db2 "create index ix_cover on hr.emp (deptno, salary desc)"
db2 describe indexes for table hr.emp
db2 "select indname, colnames, uniquerule from syscat.indexes where tabname = 'EMP'"</pre>
<h4>Design guidelines</h4>
<ul><li>Index columns used in <b>WHERE, JOIN and ORDER BY</b>; put the most selective, equality-compared column first.</li>
<li>Index <b>foreign key</b> columns – otherwise deleting a parent row scans the child table.</li>
<li>A <b>covering</b> (index-only) access reads the index alone: include all needed columns (<code>INCLUDE</code> on unique indexes).</li>
<li>Every index costs space and slows INSERT/UPDATE/DELETE. Avoid duplicates and prefix-redundant indexes (<code>(a)</code> is redundant with <code>(a,b)</code>).</li>
<li>After creating indexes, run <code>RUNSTATS</code> so the optimizer knows about them (Module 11).</li></ul>
<h4>Seeing the effect</h4>
<pre class="code">db2 "explain plan for select * from hr.emp where deptno = 10"
db2exfmt -d shop -1</pre>
<p>A <code>TBSCAN</code> reads the whole table; an <code>IXSCAN</code> + <code>FETCH</code> uses the index. Module 11 explains how to read plans.</p>` },
      {
        id: 'l3', title: 'Views, other objects and extracting DDL', html: `
<h4>Views</h4>
<pre class="code">db2 "create view hr.emp_v as select e.empno, e.name, d.deptname from hr.emp e join hr.dept d on e.deptno = d.deptno"</pre>
<p>Views hide complexity and are a security tool: grant users <code>SELECT</code> on the view but not the base tables (Module 7).</p>
<h4>Other objects you should know</h4>
<table><tr><th>Object</th><th>Purpose</th></tr>
<tr><td>Sequence</td><td>Shared number generator (<code>NEXT VALUE FOR</code>)</td></tr>
<tr><td>Alias</td><td>Alternative name for a table/view</td></tr>
<tr><td>MQT (materialized query table)</td><td>Stored query result the optimizer can use automatically</td></tr>
<tr><td>Trigger / procedure / function</td><td>Server-side logic</td></tr>
<tr><td>Declared global temporary table</td><td>Session-private temp data in a user temp table space</td></tr>
<tr><td>Table compression, MDC, range partitioning</td><td>Storage and performance features for large tables</td></tr></table>
<h4>Extract DDL: db2look</h4>
<pre class="code">db2look -d shop -e
db2look -d shop -e -t emp
db2look -d shop -l
db2look -d shop -x</pre>
<p><code>-e</code> tables/indexes/views, <code>-l</code> buffer pools &amp; table spaces, <code>-x</code> grants. It is the standard way to clone a structure into another database.</p>
<h4>Catalog queries every DBA keeps handy</h4>
<pre class="code">db2 "select tabschema, tabname, tbspace, card from syscat.tables where tabschema not like 'SYS%'"
db2 "select colname, typename, length, nulls from syscat.columns where tabname = 'EMP'"</pre>` }
    ],
    labs: [{
      id: 'lab1', title: 'Lab 5.1 – Build a small schema', level: 'Beginner', terminals: 1,
      goal: 'Create an HR schema with two related tables, prove the constraints work, then add an index and a view.',
      setup: SHOP,
      steps: [
        { t: 'Create the schema and the DEPT table.', cmd: 'db2 create schema hr\ndb2 "create table hr.dept (deptno int not null primary key, deptname varchar(30) not null)"' },
        { t: 'Create EMP with a primary key, CHECK constraint and a foreign key to DEPT.', cmd: 'db2 "create table hr.emp (empno int not null primary key, name varchar(40) not null, deptno int, salary decimal(9,2) check (salary > 0), foreign key (deptno) references hr.dept(deptno))"' },
        { t: 'Insert valid rows.', cmd: 'db2 "insert into hr.dept values (10,\'Sales\'),(20,\'IT\')"\ndb2 "insert into hr.emp values (1,\'Alice\',10,5000),(2,\'Bob\',20,6500)"' },
        { t: 'Break the rules on purpose: a department that does not exist (SQL0530N) and a negative salary (SQL0545N).', cmd: 'db2 "insert into hr.emp values (3,\'Eve\',99,1000)"\ndb2 "insert into hr.emp values (4,\'Mal\',10,-5)"' },
        { t: 'Add an index on the foreign key and a view that joins the tables.', cmd: 'db2 "create index hr.ix_emp_dept on hr.emp (deptno)"\ndb2 "create view hr.emp_v as select e.empno, e.name, d.deptname from hr.emp e join hr.dept d on e.deptno = d.deptno"\ndb2 "select * from hr.emp_v"' },
        { t: 'Extract the DDL.', cmd: 'db2look -d shop -e' }
      ],
      hints: ['Create the parent table (DEPT) before the child (EMP).', 'The view needs both tables to exist.'],
      checks: [
        { d: 'Tables HR.DEPT and HR.EMP exist', f: (S) => { const t = S.db('SHOP').tables; return t.DEPT && t.DEPT.schema === 'HR' && t.EMP && t.EMP.schema === 'HR'; } },
        { d: 'Rows inserted (2 departments, 2 employees)', f: (S) => S.rows(S.db('SHOP'), 'select count(*) from emp')[0][0] === 2 && S.rows(S.db('SHOP'), 'select count(*) from dept')[0][0] === 2 },
        { d: 'Foreign key violation seen (SQL0530N)', f: (S) => S.failed('SQL0530N') },
        { d: 'Check constraint violation seen (SQL0545N)', f: (S) => S.failed('SQL0545N') },
        { d: 'Index IX_EMP_DEPT exists', f: (S) => !!S.db('SHOP').indexes.IX_EMP_DEPT },
        { d: 'View EMP_V exists and you ran db2look', f: (S) => !!S.db('SHOP').views.EMP_V && S.ran(/^db2look/) }
      ],
      solution: ['db2 create schema hr', 'db2 "create table hr.dept (deptno int not null primary key, deptname varchar(30) not null)"', 'db2 "create table hr.emp (empno int not null primary key, name varchar(40) not null, deptno int, salary decimal(9,2) check (salary > 0), foreign key (deptno) references hr.dept(deptno))"', 'db2 "insert into hr.dept values (10,\'Sales\'),(20,\'IT\')"', 'db2 "insert into hr.emp values (1,\'Alice\',10,5000),(2,\'Bob\',20,6500)"', 'db2 "insert into hr.emp values (3,\'Eve\',99,1000)"', 'db2 "insert into hr.emp values (4,\'Mal\',10,-5)"', 'db2 "create index hr.ix_emp_dept on hr.emp (deptno)"', 'db2 "create view hr.emp_v as select e.empno, e.name, d.deptname from hr.emp e join hr.dept d on e.deptno = d.deptno"', 'db2 "select * from hr.emp_v"', 'db2look -d shop -e']
    }],
    quiz: [
      { q: 'Which data type should you use for money amounts?', o: ['DOUBLE', 'DECIMAL(p,s)', 'REAL', 'VARCHAR'], a: 1, why: 'DECIMAL is exact; floating point causes rounding errors.' },
      { q: 'Inserting a child row with a non-existent parent key returns…', o: ['SQL0803N', 'SQL0530N', 'SQL0407N', 'SQL0545N'], a: 1, why: 'SQL0530N – foreign key value not found in parent.' },
      { q: 'After ALTER TABLE … DROP COLUMN, the table is in…', o: ['Backup pending', 'REORG-pending state', 'Quiesced state', 'Load pending'], a: 1, why: 'Run REORG TABLE before using the table normally (SQL0668N rc 7).' },
      { q: 'Which index is redundant if you already have an index on (a, b)?', o: ['(b)', '(a)', '(b, a)', '(a, b, c)'], a: 1, why: 'A prefix of an existing index adds cost but little benefit.' },
      { q: 'Which tool extracts DDL for tables, indexes and views?', o: ['db2look', 'db2diag', 'db2pd', 'db2ckbkp'], a: 0, why: 'db2look -d <db> -e generates DDL scripts.' },
      { q: 'Why index foreign-key columns?', o: ['It is required by Db2', 'To avoid child-table scans when parent rows are deleted/updated and to speed joins', 'To save disk space', 'To enable compression'], a: 1, why: 'Without it, each parent delete scans the child table.' }
    ],
    resources: [R.docs, { title: 'Look up: CREATE TABLE statement', url: C.search('CREATE TABLE statement'), note: 'Complete syntax incl. compression and partitioning.' }, { title: 'Look up: Index design guidelines', url: C.search('index design guidelines'), note: 'Performance design advice.' }, { title: 'Look up: db2look command', url: C.search('db2look command'), note: 'All db2look options.' }]
  });

  /* ===================== MODULE 6 ===================== */
  C.add({
    n: 6, id: 'm6', icon: '🚚', title: 'Data Movement: EXPORT, IMPORT & LOAD', minutes: 70,
    summary: 'Move data in and out of Db2 with the right utility, and avoid the classic LOAD pitfall that leaves a table space in BACKUP PENDING.',
    objectives: ['Choose between EXPORT, IMPORT, LOAD, INGEST and db2move', 'Run EXPORT/IMPORT/LOAD with DEL files', 'Explain why LOAD is fast and what it costs (not logged)', 'Clear a BACKUP PENDING state'],
    lessons: [
      {
        id: 'l1', title: 'The data movement toolbox', html: `
<table><tr><th>Utility</th><th>Direction</th><th>Logged?</th><th>Best for</th></tr>
<tr><td><b>EXPORT</b></td><td>table/query → file</td><td>n/a</td><td>Extracts, reports, small copies</td></tr>
<tr><td><b>IMPORT</b></td><td>file → table via SQL INSERT</td><td>Yes</td><td>Small/medium files; table stays available; triggers fire</td></tr>
<tr><td><b>LOAD</b></td><td>file → table by building pages directly</td><td>No (unless COPY YES)</td><td>Large volumes, fastest</td></tr>
<tr><td><b>INGEST</b></td><td>continuous streaming load via SQL</td><td>Yes</td><td>Continuous feeds while table is in use</td></tr>
<tr><td><b>db2move</b></td><td>whole database</td><td>—</td><td>Copy many tables (uses export/import/load)</td></tr></table>
<h4>File formats</h4>
<ul><li><b>DEL</b> – delimited text (CSV-like). Default column delimiter <code>,</code>, strings in <code>"…"</code>.</li><li><b>ASC</b> – fixed-position text.</li><li><b>IXF</b> – Db2's own format; carries table definition, ideal between Db2 systems.</li><li><b>CURSOR</b> – load from a query (LOAD FROM CURSOR).</li></ul>
<p>The lab environment already contains sample files:</p>
<pre class="code">ls /home/db2inst1/data
head -3 /home/db2inst1/data/employees.del
wc -l /home/db2inst1/data/sales.del</pre>` },
      {
        id: 'l2', title: 'EXPORT and IMPORT', html: `
<pre class="code-plain">EXPORT TO file OF DEL|IXF [MODIFIED BY ...] [MESSAGES msgfile] select-statement
IMPORT FROM file OF DEL|IXF [MODIFIED BY ...] [COMMITCOUNT n] [MESSAGES msgfile]
       INSERT | INSERT_UPDATE | REPLACE | CREATE  INTO table [(columns)]</pre>
<pre class="code">db2 "export to /home/db2inst1/data/high_paid.del of del select * from employees where salary > 60000"
db2 "export to /tmp/emp.ixf of ixf select * from employees"
db2 import from /home/db2inst1/data/employees.del of del insert into employees
db2 import from /home/db2inst1/data/employees.del of del commitcount 1000 messages /tmp/imp.msg insert_update into employees</pre>
<ul><li><b>INSERT</b> adds rows; <b>INSERT_UPDATE</b> updates existing keys (needs a primary key); <b>REPLACE</b> deletes everything first.</li>
<li><b>COMMITCOUNT n</b> commits every n rows – keeps log usage and locks low for big imports (or <code>AUTOMATIC</code>).</li>
<li>The result summary shows rows read / inserted / updated / <b>rejected</b> / committed. Always read the <code>MESSAGES</code> file for rejected rows.</li>
<li>IMPORT is slower than LOAD because each row goes through SQL and is logged, but the table stays online and constraints/triggers apply.</li></ul>` },
      {
        id: 'l3', title: 'LOAD – speed and its price', html: `
<pre class="code">db2 load from /home/db2inst1/data/employees.del of del insert into employees
db2 load from file.del of del replace into employees copy yes to /db2backup
db2 load from file.del of del insert into employees nonrecoverable</pre>
<h4>Phases</h4>
<ol><li><b>Load</b> – read input, format and write data pages directly (bypassing normal logging)</li><li><b>Build</b> – rebuild indexes</li><li><b>Delete</b> – remove rows that violated unique constraints</li><li><b>Index copy</b> (optional)</li></ol>
<h4>The big trap: BACKUP PENDING</h4>
<p>Because LOAD does not log the inserted rows, rollforward recovery could not re-create them. If your database uses <b>archive logging</b> and you run LOAD without telling Db2 how the data would be recovered, the table space is placed in <b>BACKUP PENDING</b> (<code>0x0020</code>). Nobody can access the tables in it (<code>SQL0290N</code>) until it is backed up.</p>
<table><tr><th>Option</th><th>What it does</th></tr>
<tr><td><code>COPY YES TO path</code></td><td>Saves a copy of the loaded data so rollforward can restore it. Table space stays available.</td></tr>
<tr><td><code>NONRECOVERABLE</code></td><td>Table space stays available, but the table cannot be recovered by rollforward past this point.</td></tr>
<tr><td>neither</td><td>Table space → backup pending; fix with <code>BACKUP DATABASE … TABLESPACE (ts)</code>.</td></tr></table>
<div class="callout warn"><b>Production tip:</b> in an archive-logging database always specify <code>COPY YES</code> (or schedule a table-space backup right after the load).</div>
<h4>LOAD vs IMPORT</h4>
<table><tr><th></th><th>IMPORT</th><th>LOAD</th></tr><tr><td>Speed</td><td>Slower</td><td>Much faster</td></tr><tr><td>Logging</td><td>Full</td><td>Minimal</td></tr><tr><td>Table availability</td><td>Online</td><td>Locked during load</td></tr><tr><td>Triggers</td><td>Fire</td><td>Do not fire</td></tr><tr><td>Authority</td><td>INSERT</td><td>LOAD authority + INSERT</td></tr></table>` }
    ],
    labs: [
      {
        id: 'lab1', title: 'Lab 6.1 – Import, export and load', level: 'Beginner', terminals: 1,
        goal: 'Import 20 employees from a DEL file, export the high earners, and load them into a second table.',
        setup: SHOP,
        steps: [
          { t: 'Create the EMPLOYEES table matching the columns of <code>employees.del</code> (id, name, dept, salary, hired).', cmd: 'db2 "create table employees (id int not null primary key, name varchar(30), dept varchar(20), salary int, hired date)"' },
          { t: 'Look at the file, then import it.', cmd: 'head -3 /home/db2inst1/data/employees.del\ndb2 import from /home/db2inst1/data/employees.del of del insert into employees\ndb2 "select count(*) from employees"' },
          { t: 'Export employees earning more than 60000.', cmd: 'db2 "export to /home/db2inst1/data/high_paid.del of del select * from employees where salary > 60000"\nls /home/db2inst1/data' },
          { t: 'Create a table with the same structure and LOAD the exported file into it.', cmd: 'db2 "create table employees_copy like employees"\ndb2 load from /home/db2inst1/data/high_paid.del of del insert into employees_copy\ndb2 "select count(*) from employees_copy"' }
        ],
        hints: ['The column count in the table must match the file (5 columns).', 'Use "create table … like …" to clone the structure.'],
        checks: [
          { d: 'EMPLOYEES has 20 rows', f: (S) => S.rows(S.db('SHOP'), 'select count(*) from employees')[0][0] === 20 },
          { d: 'high_paid.del was exported', f: (S) => !!S.sim.files['/home/db2inst1/data/high_paid.del'] },
          { d: 'EMPLOYEES_COPY holds the 12 exported rows', f: (S) => S.rows(S.db('SHOP'), 'select count(*) from employees_copy')[0][0] === 12 },
          { d: 'You used import, export and load', f: (S) => S.ran(/^db2 import|^import/i) && S.ran(/export to/i) && S.ran(/load from/i) }
        ],
        solution: ['db2 "create table employees (id int not null primary key, name varchar(30), dept varchar(20), salary int, hired date)"', 'head -3 /home/db2inst1/data/employees.del', 'db2 import from /home/db2inst1/data/employees.del of del insert into employees', 'db2 "select count(*) from employees"', 'db2 "export to /home/db2inst1/data/high_paid.del of del select * from employees where salary > 60000"', 'ls /home/db2inst1/data', 'db2 "create table employees_copy like employees"', 'db2 load from /home/db2inst1/data/high_paid.del of del insert into employees_copy', 'db2 "select count(*) from employees_copy"']
      },
      {
        id: 'lab2', title: 'Lab 6.2 – The LOAD backup-pending trap', level: 'Advanced', terminals: 1,
        goal: 'See a table space go into BACKUP PENDING after an unprotected LOAD, then fix it with a table space backup.',
        setup: ['db2start', 'mkdir -p /db2archive /db2backup', 'db2 create database shop', 'db2 update db cfg for shop using logarchmeth1 disk:/db2archive', 'db2 backup database shop to /db2backup', 'db2 connect to shop', 'db2 "create table employees (id int not null primary key, name varchar(30), dept varchar(20), salary int, hired date)"'],
        steps: [
          { t: 'The database uses archive logging (already configured and backed up). LOAD the sample file without COPY YES.', cmd: 'db2 load from /home/db2inst1/data/employees.del of del insert into employees' },
          { t: 'Try to read the table – <code>SQL0290N</code>. Then look at the table space state.', cmd: 'db2 "select count(*) from employees"\ndb2 list tablespaces' },
          { t: 'Fix it: back up the affected table space (USERSPACE1).', cmd: 'db2 backup database shop tablespace (userspace1) online to /db2backup' },
          { t: 'Verify the data is accessible again.', cmd: 'db2 "select count(*) from employees"' }
        ],
        hints: ['State 0x0020 = backup pending.', 'A full database backup would also work, but a table space backup is enough.'],
        checks: [
          { d: 'You hit SQL0290N (table space not accessible)', f: (S) => S.failed('SQL0290N') },
          { d: 'USERSPACE1 is back to normal state', f: (S) => S.db('SHOP').tablespaces.USERSPACE1.state === 0 },
          { d: 'You ran a table space backup', f: (S) => S.ran(/backup (db|database) shop tablespace/i) },
          { d: 'EMPLOYEES contains 20 rows', f: (S) => S.rows(S.db('SHOP'), 'select count(*) from employees')[0][0] === 20 }
        ],
        solution: ['db2 load from /home/db2inst1/data/employees.del of del insert into employees', 'db2 "select count(*) from employees"', 'db2 list tablespaces', 'db2 backup database shop tablespace (userspace1) online to /db2backup', 'db2 "select count(*) from employees"']
      }
    ],
    quiz: [
      { q: 'Which utility is fastest for loading millions of rows?', o: ['IMPORT', 'LOAD', 'INSERT statements in a loop', 'EXPORT'], a: 1, why: 'LOAD writes formatted pages directly and avoids per-row logging.' },
      { q: 'After LOAD in an archive-logging database without COPY YES, the table space is…', o: ['Dropped', 'Backup pending', 'Quiesced exclusive', 'Read-only forever'], a: 1, why: 'State 0x0020 – back up the table space to clear it.' },
      { q: 'Which IMPORT mode deletes all existing rows first?', o: ['INSERT', 'INSERT_UPDATE', 'REPLACE', 'CREATE'], a: 2, why: 'REPLACE truncates then inserts.' },
      { q: 'What does COMMITCOUNT 1000 do in IMPORT?', o: ['Imports 1000 rows only', 'Commits every 1000 rows to limit log use and locks', 'Uses 1000 threads', 'Rejects rows after 1000 errors'], a: 1, why: 'Frequent commits keep transactions small.' },
      { q: 'Which format carries the table definition and suits moves between Db2 systems?', o: ['DEL', 'ASC', 'IXF', 'TXT'], a: 2, why: 'IXF stores column definitions with the data.' },
      { q: 'Which statement about LOAD is true?', o: ['Triggers fire for each row', 'The table remains fully available', 'It requires LOAD authority (or DBADM) and does not fire triggers', 'It is fully logged'], a: 2, why: 'LOAD needs authority, locks the table and bypasses triggers.' }
    ],
    resources: [R.docs, { title: 'Look up: LOAD command', url: C.search('LOAD command'), note: 'All options, phases and copy parameters.' }, { title: 'Look up: Data movement utilities', url: C.search('data movement utilities and reference'), note: 'Formats, IMPORT/EXPORT reference.' }, R.redbooks]
  });
})();
