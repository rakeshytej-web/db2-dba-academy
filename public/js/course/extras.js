(function () {
  const C = (typeof window !== 'undefined' ? window : global).COURSE;
  C.cheat = [
    ['Instance', [['db2start / db2stop [force]', 'Start / stop the instance'], ['db2level', 'Version and fix pack'], ['db2 get dbm cfg', 'Instance configuration'], ['db2set -all', 'Registry variables'], ['db2 force application all', 'Disconnect everyone']]],
    ['Databases', [['db2 create database X', 'Create a database'], ['db2 list db directory', 'Catalogued databases'], ['db2 connect to X / connect reset', 'Connect / disconnect'], ['db2 activate db X', 'Keep the DB open (pre-load pools)'], ['db2 get db cfg for X', 'Database configuration'], ['db2 update db cfg for X using P V', 'Change config']]],
    ['Storage', [['db2 list tablespaces show detail', 'Table spaces'], ['db2 create bufferpool BP pagesize 8k', 'Buffer pool'], ['db2 create tablespace TS pagesize 8k bufferpool BP', 'Table space'], ['db2pd -db X -bufferpools', 'Buffer pool statistics']]],
    ['Data movement', [['db2 export to f.del of del select …', 'Export'], ['db2 import from f.del of del insert into T', 'Import (logged, SQL INSERTs)'], ['db2 load from f.del of del insert into T', 'Load (fast; may set backup pending)'], ['db2look -d X -e', 'Generate DDL']]],
    ['Security', [['db2 grant select on t to user u', 'Table privilege'], ['db2 create role r / grant r to user u', 'Roles'], ['db2 revoke connect on database from public', 'Lock down CONNECT'], ['select * from syscat.dbauth', 'Who has what']]],
    ['Backup & recovery', [['db2 backup db X [online] to /dir', 'Backup'], ['db2 restore db X from /dir [taken at ts]', 'Restore'], ['db2 rollforward db X to end of logs and stop', 'Roll forward'], ['db2 rollforward db X to ts using local time and stop', 'Point in time'], ['db2 list history backup all for X', 'History'], ['db2ckbkp -h image', 'Check image']]],
    ['Performance', [['db2 runstats on table s.t and indexes all', 'Statistics'], ['db2 reorgchk update statistics on table all', 'Check reorg need'], ['db2 reorg table s.t', 'Reorganise'], ['db2 explain plan for … / db2exfmt -d X -1', 'Access plan'], ['db2pd -db X -locks', 'Lock holders / waiters']]],
    ['HADR & diagnostics', [['db2 start hadr on db X as primary|standby', 'Start HADR'], ['db2 takeover hadr on db X [by force]', 'Role switch'], ['db2pd -db X -hadr', 'HADR state'], ['db2diag -l Error,Severe', 'Diagnostic log'], ['db2 "? SQL1116N"', 'Explain a message']]]
  ];
  C.roadmap = [
    { t: 'Phase 1 – Foundations (modules 1–3)', d: 'Architecture, instances, configuration, create/connect databases. Goal: comfortable in the CLP.' },
    { t: 'Phase 2 – Objects & data (modules 4–6)', d: 'Storage, tables/indexes, import/export/load. Goal: design and populate a database.' },
    { t: 'Phase 3 – Protect (modules 7–9)', d: 'Security, logging, backup, restore, rollforward. Goal: recover any failure scenario within the RTO.' },
    { t: 'Phase 4 – Run it (modules 10–12)', d: 'Locking, tuning, HADR and troubleshooting. Goal: keep production healthy.' },
    { t: 'Phase 5 – Real Db2', d: 'Install Db2 Community Edition (Docker) and repeat every lab from docs/REAL_DB2_WORKBOOK.md.' },
    { t: 'Phase 6 – Certify', d: 'IBM offers a Certified Database Administrator credential for Db2 LUW. Exam codes and objectives change between versions – check IBM Training & Certification for the current one, map its objectives to modules here, and take the practice exam in this app.' }
  ];
})();
