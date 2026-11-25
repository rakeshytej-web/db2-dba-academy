const path = require('path'); const root = path.join(__dirname, '..');
const initSqlJs = require(process.env.SQLJS || '/tmp/build/node_modules/sql.js');
const Db2Sim = require(root + '/public/js/sim.js');
require(root + '/public/js/sim-sql.js')(Db2Sim); require(root + '/public/js/sim-admin.js')(Db2Sim);
(async () => {
  const SQL = await initSqlJs(); const sim = new Db2Sim(SQL); const s1 = 1; const s2 = sim.newSession();
  const r = (s, c) => { const o = sim.run(s, c); console.log('[T' + s + '] $ ' + c + '\n' + o + '\n'); return o; };
  r(1, 'db2start'); r(1, 'db2 create db shop'); r(1, 'connect to shop'); r(2, 'connect to shop');
  r(1, 'db2 "create table t (id int not null primary key, v varchar(10))"'); r(1, 'db2 "insert into t values (1,\'a\'),(2,\'b\')"');
  r(1, 'update command options using c off'); r(1, 'db2 "update t set v=\'x\' where id=1"');
  r(2, 'db2 "select * from t"'); r(1, 'db2pd -db shop -locks'); r(2, 'db2 "select * from t with ur"');
  r(2, 'db2 update db cfg for shop using cur_commit disabled'); r(2, 'db2 "select * from t"');
  r(2, 'db2 update db cfg for shop using locktimeout 5'); r(2, 'db2 "select * from t"'); r(1, 'commit'); r(2, 'db2 "select * from t"');
  // security
  r(1, 'useradd bob'); r(1, 'db2 grant connect on database to user bob'); r(1, 'db2 connect reset');
  r(1, 'db2 connect to shop user bob using pw'); r(1, 'db2 "select * from t"'); r(1, 'db2 connect reset'); r(1, 'connect to shop');
  r(1, 'db2 grant select on table t to user bob'); r(1, 'db2 connect reset'); r(1, 'db2 connect to shop user bob using pw'); r(1, 'db2 "select * from t"'); r(1, 'db2 "delete from t"');
  r(1, 'db2 "select grantee, selectauth from syscat.tabauth where tabname=\'T\'"'); r(1, 'connect reset'); r(1, 'connect to shop');
  // storage errors
  r(1, 'db2 create tablespace ts8 pagesize 8k managed by automatic storage');
  r(1, 'db2 "create table big (a varchar(3000), b varchar(3000))"');
  r(1, 'db2 create bufferpool bp8 size 100 pagesize 8k'); r(1, 'db2 create tablespace ts8 pagesize 8k bufferpool bp8');
  r(1, 'db2 "create table big (a varchar(3000), b varchar(3000)) in ts8"');
  r(1, 'db2 drop bufferpool bp8');
  // maintenance
  r(1, 'db2 "select tabname, card from syscat.tables where tabschema=\'DB2INST1\'"'); r(1, 'db2 runstats on table t'); r(1, 'db2 "select tabname, card from syscat.tables where tabschema=\'DB2INST1\'"');
  r(1, 'db2 "select bp_name, pool_data_l_reads, pool_data_p_reads from table(mon_get_bufferpool(null,-2)) as t"');
  r(1, 'db2 "select * from sysibmadm.bp_hitratio"');
  // load
  r(1, 'mkdir -p /db2archive /db2backup'); r(1, 'db2 update db cfg for shop using logarchmeth1 disk:/db2archive'); r(1, 'db2 connect reset'); r(1, 'db2 backup db shop to /db2backup'); r(1, 'db2 connect to shop');
  r(1, 'db2 "create table emp (id int, name varchar(20), dept varchar(10), sal int, hired date)"');
  r(1, 'db2 load from /home/db2inst1/data/employees.del of del insert into emp'); r(1, 'db2 list tablespaces'); r(1, 'db2 "select count(*) from emp"');
  // hadr
  r(1, 'db2 start hadr on database shop as primary'); r(1, 'db2 update db cfg for shop using hadr_local_host db2server hadr_local_svc 55001 hadr_remote_host db2standby hadr_remote_svc 55002 hadr_remote_inst db2inst1');
  r(1, 'db2 start hadr on database shop as primary'); r(1, 'db2pd -db shop -hadr'); 
  r(1, 'ssh db2standby'); r(1, 'db2 takeover hadr on database shop'); r(1, 'db2pd -db shop -hadr | grep ROLE');
  r(1, 'db2look -d shop -e -t t');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
