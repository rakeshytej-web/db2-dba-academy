# Curriculum

## Module 1 – Db2 Architecture & Fundamentals (~60 min)

What Db2 for Linux, UNIX and Windows (LUW) is, what a DBA is responsible for, and how instances, databases, processes, memory and storage fit together.

**Objectives**
- Explain the role of a Db2 DBA and the Db2 editions
- Describe the instance → database → table space → table hierarchy
- Name the main engine processes (EDUs) and memory areas
- Use db2start, db2level, get instance and get dbm cfg

**Lessons:** What Db2 LUW is and what a DBA does; Instance, database and process model; Memory and storage at a glance

**Labs:** Lab 1.1 – Meet your instance

**Quiz:** 6 questions

## Module 2 – Instances & Configuration (~60 min)

Create and manage instances, understand the configuration hierarchy (registry → DBM CFG → DB CFG) and read the diagnostic log.

**Objectives**
- Use db2icrt/db2idrop/db2ilist/db2start/db2stop
- Change registry variables with db2set
- Update DBM CFG and know which changes need a restart
- Read db2diag output and tune DIAGLEVEL

**Lessons:** Instance management commands; The configuration hierarchy; Diagnostics basics: db2diag.log and DIAGLEVEL

**Labs:** Lab 2.1 – Configure the instance

**Quiz:** 6 questions

## Module 3 – Creating & Managing Databases (~70 min)

CREATE DATABASE options (some are permanent!), the database directory, connecting, activating and the key database configuration parameters.

**Objectives**
- Create a database with automatic storage and choose page size/code set
- Catalog aliases and read the database directory
- Connect, activate, deactivate; list applications and force them off
- Read and update the database configuration

**Lessons:** Creating a database – choices you cannot undo; Directories, connecting and activating; Database configuration (DB CFG)

**Labs:** Lab 3.1 – Create and manage a database

**Quiz:** 6 questions

## Module 4 – Storage: Buffer Pools & Table Spaces (~90 min)

How Db2 caches and stores data: buffer pools, page sizes, SMS/DMS/automatic-storage table spaces, extents, prefetching, and monitoring capacity.

**Objectives**
- Create buffer pools and match them to table-space page sizes
- Choose between automatic storage, DMS and SMS table spaces
- Create regular, large and temporary table spaces
- Compute and improve the buffer pool hit ratio
- Monitor table-space usage

**Lessons:** Buffer pools; Table spaces: SMS, DMS and automatic storage; Monitoring capacity and container layout

**Labs:** Lab 4.1 – Table space for a wide table; Lab 4.2 – Tune a buffer pool

**Quiz:** 6 questions

## Module 5 – Tables, Indexes & Database Objects (~80 min)

Design tables with the right data types and constraints, add indexes that help (and know when they hurt), and explore views, schemas and the catalog.

**Objectives**
- Create tables with PK, FK, UNIQUE, CHECK and identity columns
- Use schemas and views
- Design and create indexes, including unique and composite
- Extract DDL with db2look and query the catalog

**Lessons:** Schemas, data types and constraints; Indexes; Views, other objects and extracting DDL

**Labs:** Lab 5.1 – Build a small schema

**Quiz:** 6 questions

## Module 6 – Data Movement: EXPORT, IMPORT & LOAD (~70 min)

Move data in and out of Db2 with the right utility, and avoid the classic LOAD pitfall that leaves a table space in BACKUP PENDING.

**Objectives**
- Choose between EXPORT, IMPORT, LOAD, INGEST and db2move
- Run EXPORT/IMPORT/LOAD with DEL files
- Explain why LOAD is fast and what it costs (not logged)
- Clear a BACKUP PENDING state

**Lessons:** The data movement toolbox; EXPORT and IMPORT; LOAD – speed and its price

**Labs:** Lab 6.1 – Import, export and load; Lab 6.2 – The LOAD backup-pending trap

**Quiz:** 6 questions

## Module 7 – Security: Authorities, Privileges & Roles (~75 min)

How Db2 authenticates users, the authority hierarchy, granting and revoking privileges, roles, and a tour of advanced controls such as RCAC and encryption.

**Objectives**
- Explain authentication vs. authorization
- Name the instance-level and database-level authorities
- GRANT and REVOKE database and object privileges
- Use roles and views to implement least privilege
- Audit who can do what from the catalog

**Lessons:** Authentication and authorities; Privileges, GRANT/REVOKE and roles; Advanced protection (concepts)

**Labs:** Lab 7.1 – Role-based access

**Quiz:** 6 questions

## Module 8 – Transaction Logging & Backup (~90 min)

How the transaction log works, circular vs. archive logging, and how to take full, online, incremental and table-space backups.

**Objectives**
- Explain write-ahead logging, commit and rollback
- Configure archive logging and understand BACKUP PENDING
- Take offline, online, incremental and table-space backups
- Read the recovery history file and verify backup images

**Lessons:** How transaction logging works; Backup types and commands; Designing a backup strategy

**Labs:** Lab 8.1 – Archive logging and the backup family

**Quiz:** 6 questions

## Module 9 – Restore & Rollforward Recovery (~90 min)

Recover from failures: crash recovery, version recovery, rollforward to end of logs or a point in time, and table-space recovery.

**Objectives**
- Distinguish crash, version and rollforward recovery
- Run RESTORE and ROLLFORWARD correctly
- Recover to a point in time after a user error
- Restore individual table spaces
- Choose the right recovery for a scenario

**Lessons:** Types of recovery; RESTORE and ROLLFORWARD in detail; Recovery playbook

**Labs:** Lab 9.1 – Disaster: restore and roll forward; Lab 9.2 – Undo an accidental DELETE (point in time)

**Quiz:** 6 questions

## Module 10 – Locking & Concurrency (~75 min)

How Db2 keeps concurrent transactions consistent: lock modes, isolation levels, lock waits, timeouts, deadlocks and how to find and resolve blockers.

**Objectives**
- Explain lock modes and isolation levels
- Reproduce and diagnose a lock wait with two sessions
- Use LOCKTIMEOUT, CUR_COMMIT and db2pd -locks
- Resolve blockers with FORCE APPLICATION
- Recognise deadlocks and lock escalation

**Lessons:** Locks and isolation levels; Lock waits, timeouts, deadlocks

**Labs:** Lab 10.1 – Two sessions: blocker and victim

**Quiz:** 6 questions

## Module 11 – Monitoring, Maintenance & Tuning (~90 min)

Keep Db2 healthy and fast: statistics, REORG, explain plans, monitoring table functions and the buffer pool hit ratio.

**Objectives**
- Collect statistics with RUNSTATS and know why the optimizer needs them
- Decide when to REORG with REORGCHK
- Read an access plan (TBSCAN vs IXSCAN)
- Use MON_GET_* functions and db2pd for monitoring
- Follow a systematic tuning method

**Lessons:** Statistics, RUNSTATS and REORG; Explain: reading access plans; Monitoring and a tuning method

**Labs:** Lab 11.1 – Statistics, explain and an index

**Quiz:** 6 questions

## Module 12 – High Availability (HADR) & Troubleshooting (~90 min)

Keep Db2 available with HADR, perform a takeover, and build a repeatable approach to diagnosing real problems.

**Objectives**
- Explain HADR roles, states and synchronization modes
- Configure HADR and take over to the standby
- Know related HA options (pureScale, Db2 replication, cloud)
- Diagnose with db2diag.log and a standard checklist
- Fix the common "database will not connect" problems

**Lessons:** HADR: High Availability Disaster Recovery; Other availability options; Troubleshooting toolkit and playbook

**Labs:** Lab 12.1 – Configure HADR and take over; Lab 12.2 – Troubleshooting drill: "I cannot connect!"

**Quiz:** 6 questions

