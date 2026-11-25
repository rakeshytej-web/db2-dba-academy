# Command cheat sheet

## Instance

| Command | Purpose |
|---|---|
| `db2start / db2stop [force]` | Start / stop the instance |
| `db2level` | Version and fix pack |
| `db2 get dbm cfg` | Instance configuration |
| `db2set -all` | Registry variables |
| `db2 force application all` | Disconnect everyone |

## Databases

| Command | Purpose |
|---|---|
| `db2 create database X` | Create a database |
| `db2 list db directory` | Catalogued databases |
| `db2 connect to X / connect reset` | Connect / disconnect |
| `db2 activate db X` | Keep the DB open (pre-load pools) |
| `db2 get db cfg for X` | Database configuration |
| `db2 update db cfg for X using P V` | Change config |

## Storage

| Command | Purpose |
|---|---|
| `db2 list tablespaces show detail` | Table spaces |
| `db2 create bufferpool BP pagesize 8k` | Buffer pool |
| `db2 create tablespace TS pagesize 8k bufferpool BP` | Table space |
| `db2pd -db X -bufferpools` | Buffer pool statistics |

## Data movement

| Command | Purpose |
|---|---|
| `db2 export to f.del of del select …` | Export |
| `db2 import from f.del of del insert into T` | Import (logged, SQL INSERTs) |
| `db2 load from f.del of del insert into T` | Load (fast; may set backup pending) |
| `db2look -d X -e` | Generate DDL |

## Security

| Command | Purpose |
|---|---|
| `db2 grant select on t to user u` | Table privilege |
| `db2 create role r / grant r to user u` | Roles |
| `db2 revoke connect on database from public` | Lock down CONNECT |
| `select * from syscat.dbauth` | Who has what |

## Backup & recovery

| Command | Purpose |
|---|---|
| `db2 backup db X [online] to /dir` | Backup |
| `db2 restore db X from /dir [taken at ts]` | Restore |
| `db2 rollforward db X to end of logs and stop` | Roll forward |
| `db2 rollforward db X to ts using local time and stop` | Point in time |
| `db2 list history backup all for X` | History |
| `db2ckbkp -h image` | Check image |

## Performance

| Command | Purpose |
|---|---|
| `db2 runstats on table s.t and indexes all` | Statistics |
| `db2 reorgchk update statistics on table all` | Check reorg need |
| `db2 reorg table s.t` | Reorganise |
| `db2 explain plan for … / db2exfmt -d X -1` | Access plan |
| `db2pd -db X -locks` | Lock holders / waiters |

## HADR & diagnostics

| Command | Purpose |
|---|---|
| `db2 start hadr on db X as primary|standby` | Start HADR |
| `db2 takeover hadr on db X [by force]` | Role switch |
| `db2pd -db X -hadr` | HADR state |
| `db2diag -l Error,Severe` | Diagnostic log |
| `db2 "? SQL1116N"` | Explain a message |

