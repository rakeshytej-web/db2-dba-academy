# Real Db2 workbook

Repeat every lab on a real Db2 (see INSTALL.md). Commands are taken from the in-app labs. Differences to expect: real output wording/formatting, real paths (e.g. archive log directory layout), and **timings** (point-in-time labs need a real pause between steps). Simulator-only shortcuts: `useradd` creates a fake OS user, `ssh db2standby` switches to the simulated standby - on real systems use your OS tools and the real standby host. Where a lab says "terminal 2", open a second shell/session. Lab setup commands are listed first - run them as the instance owner (`db2inst1`).

## Lab 1.1 – Meet your instance

**Goal:** Start the instance, inspect its version and configuration, and create your first database.

**Setup**
```

```

1. Check who you are and where you are: whoami

```
whoami
```

2. Show the Db2 version/level: db2level

```
db2level
```

3. List instances: db2ilist

```
db2ilist
```

4. Start the instance (the engine process): db2start

```
db2start
```

5. Show the current instance, then look at diagnostic settings in the DBM configuration using grep.

```
db2 get instance
db2 get dbm cfg | grep -i diag
```

6. Create the database SAMPLE and list the database directory.

```
db2 create database sample
db2 list db directory
```

**Success criteria**
- [ ] Instance is started
- [ ] You ran db2level
- [ ] You inspected the DBM configuration
- [ ] Database SAMPLE exists
- [ ] You listed the database directory

## Lab 2.1 – Configure the instance

**Goal:** Raise the diagnostic level, set the service port, change the registry and restart the instance so the changes apply.

**Setup**
```
db2start
```

1. Raise the diagnostic level to 4.

```
db2 update dbm cfg using DIAGLEVEL 4
```

2. Set the service port (note the SQL1362W warning – a restart is needed).

```
db2 update dbm cfg using SVCENAME 50000
```

3. Enable TCP/IP communications in the registry.

```
db2set DB2COMM=TCPIP
```

4. Restart the instance.

```
db2stop
db2start
```

5. Verify with grep, then read the diagnostic log.

```
db2 get dbm cfg | grep -E "DIAGLEVEL|SVCENAME"
db2diag
```

**Success criteria**
- [ ] DIAGLEVEL is 4
- [ ] SVCENAME is 50000
- [ ] DB2COMM registry variable is TCPIP
- [ ] Instance was stopped and restarted (it is running)
- [ ] You read the diagnostic log

## Lab 3.1 – Create and manage a database

**Goal:** Create TRAIN with an 8 KB page size, inspect it, give it an alias, then activate and deactivate it.

**Setup**
```
db2start
```

1. Create the database with an 8 KB default page size.

```
db2 create database TRAIN automatic storage yes pagesize 8192
```

2. Connect and look at the default table spaces and their page sizes.

```
db2 connect to TRAIN
db2 list tablespaces show detail
db2 "select tbspace, pagesize from syscat.tablespaces"
```

3. Disconnect, then catalog an alias TRN for TRAIN.

```
db2 connect reset
db2 catalog database TRAIN as TRN
```

4. Activate the database, list active databases, then deactivate it.

```
db2 activate database TRAIN
db2 list active databases
db2 deactivate database TRAIN
```

**Success criteria**
- [ ] Database TRAIN exists with 8192-byte page size
- [ ] Alias TRN points to TRAIN
- [ ] You activated the database
- [ ] You listed active databases
- [ ] Database is deactivated again

## Lab 4.1 – Table space for a wide table

**Goal:** Hit the row-length limit on a 4 KB page, then solve it with an 8 KB buffer pool and table space.

**Setup**
```
db2start
db2 create database shop
db2 connect to shop
```

1. Try to create a table whose row is longer than 4005 bytes. It must fail with SQL0670N.

```
db2 "create table wide (id int, a varchar(3000), b varchar(3000))"
```

2. Create an 8 KB buffer pool, then a matching 8 KB automatic-storage table space that uses it.

```
db2 create bufferpool bp8k size 1000 pagesize 8k
db2 create tablespace ts_wide pagesize 8k managed by automatic storage bufferpool bp8k
```

3. Create the table again, this time IN ts_wide.

```
db2 "create table wide (id int, a varchar(3000), b varchar(3000)) in ts_wide"
```

4. Verify the layout using the catalog.

```
db2 "select tbspace, pagesize, bufferpool from syscat.tablespaces"
db2 "select tabname, tbspace from syscat.tables where tabname = 'WIDE'"
```

**Success criteria**
- [ ] You triggered SQL0670N (row too long)
- [ ] Buffer pool BP8K exists with 8 KB pages
- [ ] Table space TS_WIDE uses BP8K
- [ ] Table WIDE lives in TS_WIDE

## Lab 4.2 – Tune a buffer pool

**Goal:** Create a deliberately tiny buffer pool, measure a terrible hit ratio, then enlarge it and measure again.

**Setup**
```
db2start
db2 create database shop
db2 connect to shop
```

1. Create a 20-page buffer pool, a table space that uses it, and a table in that table space.

```
db2 create bufferpool bp_small size 20 pagesize 4k
db2 create tablespace ts_small managed by automatic storage bufferpool bp_small
db2 "create table big (id int, pad char(60)) in ts_small"
```

2. Insert 5000 rows with a recursive query.

```
db2 "insert into big with r(n) as (select 1 from sysibm.sysdummy1 union all select n+1 from r where n < 5000) select n, 'x' from r"
```

3. Run a table scan twice (the table is bigger than the buffer pool, so every scan goes to disk).

```
db2 "select count(*) from big where pad = 'y'"
db2 "select count(*) from big where pad = 'y'"
```

4. Measure: logical vs. physical reads and the hit ratio.

```
db2 "select bp_name, pool_data_l_reads, pool_data_p_reads from table(mon_get_bufferpool(null,-2)) as t where bp_name = 'BP_SMALL'"
db2 "select bp_name, total_hit_ratio_percent from sysibmadm.bp_hitratio"
```

5. Enlarge the buffer pool to 1000 pages, run the scan three more times and measure again.

```
db2 alter bufferpool bp_small size 1000
db2 "select count(*) from big where pad = 'y'"
db2 "select count(*) from big where pad = 'y'"
db2 "select count(*) from big where pad = 'y'"
db2 "select * from sysibmadm.bp_hitratio"
```

**Success criteria**
- [ ] BP_SMALL was enlarged to at least 500 pages
- [ ] Table BIG has 5000 rows
- [ ] You queried the buffer pool monitor data
- [ ] BP_SMALL hit ratio is now above 30%

## Lab 5.1 – Build a small schema

**Goal:** Create an HR schema with two related tables, prove the constraints work, then add an index and a view.

**Setup**
```
db2start
db2 create database shop
db2 connect to shop
```

1. Create the schema and the DEPT table.

```
db2 create schema hr
db2 "create table hr.dept (deptno int not null primary key, deptname varchar(30) not null)"
```

2. Create EMP with a primary key, CHECK constraint and a foreign key to DEPT.

```
db2 "create table hr.emp (empno int not null primary key, name varchar(40) not null, deptno int, salary decimal(9,2) check (salary > 0), foreign key (deptno) references hr.dept(deptno))"
```

3. Insert valid rows.

```
db2 "insert into hr.dept values (10,'Sales'),(20,'IT')"
db2 "insert into hr.emp values (1,'Alice',10,5000),(2,'Bob',20,6500)"
```

4. Break the rules on purpose: a department that does not exist (SQL0530N) and a negative salary (SQL0545N).

```
db2 "insert into hr.emp values (3,'Eve',99,1000)"
db2 "insert into hr.emp values (4,'Mal',10,-5)"
```

5. Add an index on the foreign key and a view that joins the tables.

```
db2 "create index hr.ix_emp_dept on hr.emp (deptno)"
db2 "create view hr.emp_v as select e.empno, e.name, d.deptname from hr.emp e join hr.dept d on e.deptno = d.deptno"
db2 "select * from hr.emp_v"
```

6. Extract the DDL.

```
db2look -d shop -e
```

**Success criteria**
- [ ] Tables HR.DEPT and HR.EMP exist
- [ ] Rows inserted (2 departments, 2 employees)
- [ ] Foreign key violation seen (SQL0530N)
- [ ] Check constraint violation seen (SQL0545N)
- [ ] Index IX_EMP_DEPT exists
- [ ] View EMP_V exists and you ran db2look

## Lab 6.1 – Import, export and load

**Goal:** Import 20 employees from a DEL file, export the high earners, and load them into a second table.

**Setup**
```
db2start
db2 create database shop
db2 connect to shop
```

1. Create the EMPLOYEES table matching the columns of employees.del (id, name, dept, salary, hired).

```
db2 "create table employees (id int not null primary key, name varchar(30), dept varchar(20), salary int, hired date)"
```

2. Look at the file, then import it.

```
head -3 /home/db2inst1/data/employees.del
db2 import from /home/db2inst1/data/employees.del of del insert into employees
db2 "select count(*) from employees"
```

3. Export employees earning more than 60000.

```
db2 "export to /home/db2inst1/data/high_paid.del of del select * from employees where salary > 60000"
ls /home/db2inst1/data
```

4. Create a table with the same structure and LOAD the exported file into it.

```
db2 "create table employees_copy like employees"
db2 load from /home/db2inst1/data/high_paid.del of del insert into employees_copy
db2 "select count(*) from employees_copy"
```

**Success criteria**
- [ ] EMPLOYEES has 20 rows
- [ ] high_paid.del was exported
- [ ] EMPLOYEES_COPY holds the 12 exported rows
- [ ] You used import, export and load

## Lab 6.2 – The LOAD backup-pending trap

**Goal:** See a table space go into BACKUP PENDING after an unprotected LOAD, then fix it with a table space backup.

**Setup**
```
db2start
mkdir -p /db2archive /db2backup
db2 create database shop
db2 update db cfg for shop using logarchmeth1 disk:/db2archive
db2 backup database shop to /db2backup
db2 connect to shop
db2 "create table employees (id int not null primary key, name varchar(30), dept varchar(20), salary int, hired date)"
```

1. The database uses archive logging (already configured and backed up). LOAD the sample file without COPY YES.

```
db2 load from /home/db2inst1/data/employees.del of del insert into employees
```

2. Try to read the table – SQL0290N. Then look at the table space state.

```
db2 "select count(*) from employees"
db2 list tablespaces
```

3. Fix it: back up the affected table space (USERSPACE1).

```
db2 backup database shop tablespace (userspace1) online to /db2backup
```

4. Verify the data is accessible again.

```
db2 "select count(*) from employees"
```

**Success criteria**
- [ ] You hit SQL0290N (table space not accessible)
- [ ] USERSPACE1 is back to normal state
- [ ] You ran a table space backup
- [ ] EMPLOYEES contains 20 rows

## Lab 7.1 – Role-based access

**Goal:** Lock the database down, then give an analyst read-only access and an HR clerk read/write access using roles.

**Setup**
```
db2start
db2 create database shop
db2 connect to shop
db2 "create table emp (id int not null primary key, name varchar(30), salary int)"
db2 "insert into emp values (1,'Alice',5000),(2,'Bob',6000)"
```

1. Create operating-system users for the people involved (Db2 relies on the OS for identities).

```
useradd alice
useradd bob
useradd carol
```

2. Create two roles and give them privileges on EMP.

```
db2 create role analyst
db2 create role hr_clerk
db2 grant select on table emp to role analyst
db2 grant select, insert, update on table emp to role hr_clerk
```

3. Lock down CONNECT: revoke it from PUBLIC, then grant it to alice and bob only. Assign the roles.

```
db2 revoke connect on database from public
db2 grant connect on database to user alice
db2 grant connect on database to user bob
db2 grant analyst to user alice
db2 grant hr_clerk to user bob
```

4. Test as alice: SELECT works, INSERT must fail with SQL0551N.

```
db2 connect reset
db2 connect to shop user alice using Passw0rd
db2 "select * from emp"
db2 "insert into emp values (3,'Cy',1)"
db2 connect reset
```

5. Test as bob: UPDATE works, DELETE must fail.

```
db2 connect to shop user bob using Passw0rd
db2 "update emp set salary = salary + 100 where id = 1"
db2 "delete from emp where id = 2"
db2 connect reset
```

6. Try carol (no CONNECT privilege → SQL1060N), then reconnect as the instance owner and audit role membership.

```
db2 connect to shop user carol using Passw0rd
db2 connect to shop
db2 "select * from syscat.roleauth"
```

**Success criteria**
- [ ] Roles ANALYST and HR_CLERK exist
- [ ] PUBLIC no longer has CONNECT
- [ ] alice has ANALYST, bob has HR_CLERK
- [ ] ANALYST can SELECT on EMP
- [ ] You saw SQL0551N (missing privilege)
- [ ] You saw SQL1060N (no CONNECT privilege)

## Lab 8.1 – Archive logging and the backup family

**Goal:** Enable archive logging, handle BACKUP PENDING, and take offline, online and incremental backups.

**Setup**
```
db2start
db2 create database shop
db2 connect to shop
db2 "create table t (id int, v varchar(20))"
db2 "insert into t values (1,'one'),(2,'two')"
```

1. Create directories for backups and archived logs. Try an online backup – it must fail with SQL2413N (circular logging).

```
mkdir -p /db2backup /db2archive
db2 backup database shop online to /db2backup
```

2. Enable archive logging. Disconnect and try to reconnect: SQL1116N (backup pending).

```
db2 update db cfg for shop using logarchmeth1 disk:/db2archive
db2 connect reset
db2 connect to shop
```

3. Take the mandatory full offline backup, then reconnect.

```
db2 backup database shop to /db2backup
db2 connect to shop
```

4. Generate some activity, force the log to be archived, and look at the archive directory.

```
db2 "insert into t values (3,'three')"
db2 "insert into t values (4,'four')"
db2 archive log for database shop
ls /db2archive/db2inst1/SHOP/NODE0000/LOGSTREAM0000/C0000000
```

5. Take an online full backup while connected.

```
db2 backup database shop online to /db2backup
```

6. Enable change tracking. An incremental backup first fails (SQL2426N) because you need a full backup after enabling TRACKMOD.

```
db2 update db cfg for shop using trackmod yes
db2 backup database shop online incremental to /db2backup
```

7. Take an online full backup, then the incremental one, then review the history.

```
db2 backup database shop online to /db2backup
db2 backup database shop online incremental to /db2backup
db2 list history backup all for shop
```

**Success criteria**
- [ ] Archive logging is enabled
- [ ] You saw SQL2413N, SQL1116N and SQL2426N
- [ ] History has an offline (F), an online (N) and an incremental (O) backup
- [ ] At least one log file was archived
- [ ] TRACKMOD is YES and you listed the history

## Lab 9.1 – Disaster: restore and roll forward

**Goal:** The database is destroyed after 3 more transactions. Restore from the backup and roll forward so no committed row is lost.

**Setup**
```
db2start
mkdir -p /db2backup /db2archive
db2 create database shop
db2 update db cfg for shop using logarchmeth1 disk:/db2archive
db2 backup database shop to /db2backup
db2 connect to shop
db2 "create table orders (id int not null primary key, item varchar(20))"
db2 "insert into orders values (1,'pen'),(2,'book')"
db2 connect reset
db2 backup database shop to /db2backup
db2 connect to shop
```

1. The environment already has archive logging, a full backup (containing 2 orders) and an open connection. Add 3 more orders – they exist only in the logs.

```
db2 "insert into orders values (3,'lamp'),(4,'desk'),(5,'chair')"
db2 "select count(*) from orders"
```

2. 💥 Disaster: the database is lost.

```
db2 connect reset
db2 drop database shop
```

3. Restore from the backup image. Then try to connect – SQL1117N (rollforward pending).

```
db2 restore database shop from /db2backup
db2 connect to shop
```

4. Roll forward through all archived logs and stop.

```
db2 rollforward database shop to end of logs and stop
```

5. Connect and verify all 5 orders are back.

```
db2 connect to shop
db2 "select count(*) from orders"
db2 list history all for shop
```

**Success criteria**
- [ ] You saw SQL1117N after the restore
- [ ] Database SHOP exists and is no longer rollforward pending
- [ ] All 5 orders are recovered
- [ ] History records the restore and the rollforward

## Lab 9.2 – Undo an accidental DELETE (point in time)

**Goal:** Someone ran DELETE without a WHERE clause. Recover the table to the moment just before the mistake.

**Setup**
```
db2start
mkdir -p /db2backup /db2archive
db2 create database shop
db2 update db cfg for shop using logarchmeth1 disk:/db2archive
db2 backup database shop to /db2backup
db2 connect to shop
db2 "create table orders (id int not null primary key, item varchar(20))"
db2 "insert into orders values (1,'pen'),(2,'book')"
db2 connect reset
db2 backup database shop to /db2backup
db2 connect to shop
```

1. Add 3 orders (committed work after the backup).

```
db2 "insert into orders values (3,'lamp'),(4,'desk'),(5,'chair')"
```

2. Note the current timestamp – copy the value (format YYYY-MM-DD-HH.MM.SS.nnnnnn). It is your recovery target.

```
db2 "values current timestamp"
```

3. Wait a couple of seconds, then make the mistake.

```
db2 "delete from orders"
db2 "select count(*) from orders"
```

4. Restore over the existing database (disconnect first), then roll forward to your noted timestamp (use the first 19 characters: YYYY-MM-DD-HH.MM.SS) and stop.

```
db2 connect reset
db2 restore database shop from /db2backup
db2 rollforward database shop to <YOUR-TIMESTAMP> using local time and stop
```

5. Verify: the 5 orders are back, and the DELETE is gone.

```
db2 connect to shop
db2 "select * from orders"
```

**Success criteria**
- [ ] You restored and rolled forward to a point in time
- [ ] Database is usable (not pending)
- [ ] All 5 orders are back (the DELETE was undone)

## Lab 10.1 – Two sessions: blocker and victim

**Goal:** Create a lock wait with two terminals, diagnose it, then see a lock timeout and use FORCE APPLICATION.

**Setup**
```
db2start
db2 create database shop
db2 connect to shop
db2 "create table acct (id int not null primary key, bal int)"
db2 "insert into acct values (1,100),(2,200)"
```

1. Terminal 1: turn autocommit off and update a row without committing.

```
db2 +c "update acct set bal = 150 where id = 1"
```

2. Terminal 2: connect and read the table. CUR_COMMIT is ON, so you get the committed value without waiting.

```
db2 connect to shop
db2 "select * from acct"
```

3. Terminal 2: now try to update the same table – the statement waits (simulated message).

```
db2 "update acct set bal = 999 where id = 1"
```

4. Terminal 1: inspect the locks, then set a lock timeout and let terminal 2 try again.

```
db2pd -db shop -locks
db2 update db cfg for shop using locktimeout 10
```

5. Terminal 2: retry. With a timeout set you now get SQL0911N reason code 68.

```
db2 "update acct set bal = 999 where id = 1"
```

6. Terminal 1: find the applications and force terminal 2 off (practice only), then commit.

```
db2 list applications show detail
db2 force application all
db2 connect to shop
db2 commit
```

**Success criteria**
- [ ] You saw a lock wait on the second terminal
- [ ] LOCKTIMEOUT was configured
- [ ] You saw SQL0911N (timeout)
- [ ] You ran db2pd -locks
- [ ] You used FORCE APPLICATION

## Lab 11.1 – Statistics, explain and an index

**Goal:** Make a slow lookup fast: collect statistics, read the plan, add an index, verify the plan changes from TBSCAN to IXSCAN, and run REORGCHK/REORG.

**Setup**
```
db2start
db2 create database shop
db2 connect to shop
db2 "create table big (id int not null, grp int, pad varchar(20))"
db2 "insert into big with r(n) as (select 1 union all select n+1 from r where n < 3000) select n, n % 50, 'x' from r"
```

1. Check that statistics are missing, then collect them.

```
db2 "select tabname, card, stats_time from syscat.tables where tabname = 'BIG'"
db2 "runstats on table db2inst1.big"
```

2. Explain a point lookup and format the plan – expect TBSCAN.

```
db2 "explain plan for select * from big where id = 1234"
db2exfmt -d shop -1
```

3. Create an index, refresh statistics and explain again – expect IXSCAN.

```
db2 "create index ix_big_id on big (id)"
db2 "runstats on table db2inst1.big and indexes all"
db2 "explain plan for select * from big where id = 1234"
db2exfmt -d shop -1
```

4. Churn the table, then check whether a REORG is recommended and perform it.

```
db2 "delete from big where grp < 30"
db2 reorgchk update statistics on table all
db2 reorg table db2inst1.big
db2 runstats on table db2inst1.big and indexes all
```

5. Look at the most expensive statements in the package cache.

```
db2 "select substr(stmt_text,1,50) stmt, num_executions, rows_read from table(mon_get_pkg_cache_stmt(null,null,null,-2)) order by rows_read desc fetch first 3 rows only"
```

**Success criteria**
- [ ] RUNSTATS was run on BIG
- [ ] Index on BIG(ID) exists
- [ ] You explained at least two statements
- [ ] The last plan uses the index (IXSCAN)
- [ ] REORG and REORGCHK were run

## Lab 12.1 – Configure HADR and take over

**Goal:** Configure HADR for SHOP, start it as primary, check PEER state, then perform a role-swap takeover from the (simulated) standby server and back.

**Setup**
```
db2start
mkdir -p /db2backup /db2archive
db2 create database shop
db2 update db cfg for shop using logarchmeth1 disk:/db2archive
db2 backup database shop to /db2backup
db2 connect to shop
```

1. The database is in archive mode with a backup (see setup). Configure the HADR parameters.

```
db2 update db cfg for shop using HADR_LOCAL_HOST db2server HADR_LOCAL_SVC 55001 HADR_REMOTE_HOST db2standby HADR_REMOTE_SVC 55002 HADR_REMOTE_INST db2inst1 HADR_SYNCMODE NEARSYNC
```

2. Start HADR as primary and check the state – it should reach PEER.

```
db2 connect reset
db2 start hadr on database shop as primary
db2pd -db shop -hadr
```

3. Log in to the standby server and take over (planned switch).

```
ssh db2standby
db2 takeover hadr on database shop
db2pd -db shop -hadr
```

4. Return to the original server and take over again to restore the original roles.

```
exit
db2 takeover hadr on database shop
db2pd -db shop -hadr
```

**Success criteria**
- [ ] HADR parameters are configured
- [ ] HADR is started and in PEER state
- [ ] You performed a takeover
- [ ] The original server is primary again

## Lab 12.2 – Troubleshooting drill: "I cannot connect!"

**Goal:** An application team reports they cannot connect to PAYROLL. Diagnose and fix the problem, then prove the database works and is protected by a backup.

**Setup**
```
db2start
mkdir -p /db2backup /db2archive
db2 create database payroll
db2 update db cfg for payroll using logarchmeth1 disk:/db2archive
```

1. Reproduce the problem.

```
db2 connect to payroll
```

2. Look up the message and check the logs and configuration for clues.

```
db2diag
db2 get db cfg for payroll
```

3. Apply the fix the message demands (a full offline backup).

```
db2 backup database payroll to /db2backup
```

4. Verify you can connect and work, then check the history.

```
db2 connect to payroll
db2 "create table pay (id int, amt int)"
db2 list history backup all for payroll
```

**Success criteria**
- [ ] You reproduced SQL1116N
- [ ] You consulted db2diag
- [ ] The database is no longer backup pending
- [ ] A table was created after the fix

