/* Db2 DBA Academy - Db2 LUW simulator (core)
 * A teaching simulator of the Db2 command line (CLP) and instance/database model.
 * SQL runs on an embedded SQLite engine (sql.js); Db2 administration is simulated.
 * It is NOT IBM Db2 - messages follow Db2 style but are approximate.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Db2Sim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- helpers ---------- */
  const U = (s) => String(s).toUpperCase();
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function fail(code, msg, state) {
    const e = new Error(msg); e.db2 = true; e.code = code; e.state = state; throw e;
  }
  const fmtErr = (e) => (e.code === 'SQLWAIT' ? e.message : e.code + '  ' + e.message + (e.state ? '  SQLSTATE=' + e.state : ''));
  const p2 = (n) => String(n).padStart(2, '0');
  const ts14 = (d) => d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
  const tsDb2 = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '-' + p2(d.getHours()) + '.' + p2(d.getMinutes()) + '.' + p2(d.getSeconds()) + '.000000';
  const tsIso = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
  function b64enc(u8) {
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    let s = ''; const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  function b64dec(s) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
    const bin = atob(s); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function splitOutside(str, ch) {
    const out = []; let cur = ''; let q = null;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (q) { cur += c; if (c === q) q = null; }
      else if (c === '"' || c === "'") { q = c; cur += c; }
      else if (c === ch) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur); return out;
  }
  function mapOutsideStrings(sql, fn) {
    return sql.split(/('(?:[^']|'')*')/).map((seg, i) => (i % 2 ? seg : fn(seg))).join('');
  }
  const unq = (s) => { s = String(s).trim(); const m = s.match(/^(["'])(.*)\1$/); return m ? m[2] : s; };
  const pageNum = (s) => { // 4K, 8K, 16K, 32K or raw bytes
    s = String(s).toUpperCase().replace(/\s/g, '');
    const m = s.match(/^(\d+)(K)?$/); if (!m) return 0;
    let n = parseInt(m[1], 10); if (m[2] || n <= 32) n *= 1024; return n;
  };

  /* ---------- configuration tables ---------- */
  // [name, default, description, restartNeeded]
  const DBM_CFG = [
    ['SYSADM_GROUP', 'DB2IADM1', 'SYSADM group name', 1],
    ['SYSCTRL_GROUP', '', 'SYSCTRL group name', 1],
    ['SYSMAINT_GROUP', '', 'SYSMAINT group name', 1],
    ['SYSMON_GROUP', '', 'SYSMON group name', 1],
    ['AUTHENTICATION', 'SERVER', 'Authentication type server', 1],
    ['DFTDBPATH', '/home/db2inst1', 'Default database path', 0],
    ['DIAGLEVEL', '3', 'Diagnostic error capture level', 0],
    ['DIAGPATH', '/home/db2inst1/sqllib/db2dump/ $m', 'Diagnostic data directory path', 0],
    ['DIAGSIZE', '0', 'Rotating db2diag and notify logs (MB)', 0],
    ['NOTIFYLEVEL', '3', 'Notify level', 0],
    ['SVCENAME', 'db2c_db2inst1', 'TCP/IP Service name', 1],
    ['INSTANCE_MEMORY', 'AUTOMATIC', 'Global instance memory (4KB)', 1],
    ['MON_HEAP_SZ', 'AUTOMATIC', 'Database monitor heap size (4KB)', 0],
    ['NUMDB', '32', 'Max number of concurrently active databases', 1],
    ['CATALOG_NOAUTH', 'NO', 'Cataloging allowed without authority', 0],
    ['DFT_MON_BUFPOOL', 'OFF', 'Default monitor switch: buffer pool', 0],
    ['DFT_MON_LOCK', 'OFF', 'Default monitor switch: lock', 0],
    ['DFT_MON_SORT', 'OFF', 'Default monitor switch: sort', 0],
    ['DFT_MON_STMT', 'OFF', 'Default monitor switch: statement', 0],
    ['DFT_MON_TABLE', 'OFF', 'Default monitor switch: table', 0],
    ['DFT_MON_TIMESTAMP', 'ON', 'Default monitor switch: timestamp', 0],
    ['DFT_MON_UOW', 'OFF', 'Default monitor switch: unit of work', 0]
  ];
  const DBM_RANGE = { DIAGLEVEL: [0, 4], NOTIFYLEVEL: [0, 4], NUMDB: [1, 256] };
  const DB_CFG = [
    ['LOGBUFSZ', '256', 'Log buffer size (4KB)', 1],
    ['DBHEAP', 'AUTOMATIC', 'Database heap (4KB)', 0],
    ['LOCKLIST', 'AUTOMATIC', 'Max storage for lock list (4KB)', 0],
    ['MAXLOCKS', 'AUTOMATIC', 'Percent. of lock lists per application', 0],
    ['LOCKTIMEOUT', '-1', 'Lock timeout (sec)', 0],
    ['DLCHKTIME', '10000', 'Interval for checking deadlock (ms)', 0],
    ['CUR_COMMIT', 'ON', 'Currently Committed', 0],
    ['SORTHEAP', 'AUTOMATIC', 'Sort list heap (4KB)', 0],
    ['SHEAPTHRES_SHR', 'AUTOMATIC', 'Sort heap threshold for shared sorts (4KB)', 0],
    ['PCKCACHESZ', 'AUTOMATIC', 'Package cache size (4KB)', 0],
    ['STMTHEAP', 'AUTOMATIC', 'SQL statement heap (4KB)', 0],
    ['APPLHEAPSZ', 'AUTOMATIC', 'Default application heap (4KB)', 0],
    ['MAXAPPLS', 'AUTOMATIC', 'Max number of active applications', 0],
    ['CHNGPGS_THRES', '80', 'Changed pages threshold', 0],
    ['NUM_IOCLEANERS', 'AUTOMATIC', 'Number of asynchronous page cleaners', 1],
    ['NUM_IOSERVERS', 'AUTOMATIC', 'Number of I/O servers', 1],
    ['DATABASE_MEMORY', 'AUTOMATIC', 'Size of database shared memory (4KB)', 0],
    ['SELF_TUNING_MEM', 'ON', 'Self tuning memory', 0],
    ['DFT_QUERYOPT', '5', 'Default query optimization class', 0],
    ['DFT_DEGREE', '1', 'Degree of parallelism', 0],
    ['DFT_EXTENT_SZ', '32', 'Default extent size of table spaces (pages)', 0],
    ['DFT_PREFETCH_SZ', 'AUTOMATIC', 'Default prefetch size (pages)', 0],
    ['LOGFILSIZ', '1000', 'Log file size (4KB)', 1],
    ['LOGPRIMARY', '3', 'Number of primary log files', 1],
    ['LOGSECOND', '2', 'Number of secondary log files', 0],
    ['NEWLOGPATH', '', 'Changed path to log files', 1],
    ['MIRRORLOGPATH', '', 'Mirror log path', 1],
    ['OVERFLOWLOGPATH', '', 'Overflow log path', 0],
    ['LOGARCHMETH1', 'OFF', 'First log archive method', 0],
    ['LOGARCHMETH2', 'OFF', 'Second log archive method', 0],
    ['FAILARCHPATH', '', 'Failover log archive path', 0],
    ['NUMARCHRETRY', '5', 'Number of log archive retries on error', 0],
    ['ARCHRETRYDELAY', '20', 'Log archive retry Delay (secs)', 0],
    ['BLK_LOG_DSK_FUL', 'NO', 'Block log on disk full', 0],
    ['MAX_LOG', '0', 'Percent max primary log space by transaction', 0],
    ['NUM_LOG_SPAN', '0', 'Num. of active log files for 1 active UOW', 0],
    ['LOGINDEXBUILD', 'OFF', 'Log index pages created', 0],
    ['TRACKMOD', 'NO', 'Track modified pages enabled', 0],
    ['AUTO_MAINT', 'ON', 'Automatic maintenance', 0],
    ['AUTO_DB_BACKUP', 'OFF', 'Automatic database backup', 0],
    ['AUTO_TBL_MAINT', 'ON', 'Automatic table maintenance', 0],
    ['AUTO_RUNSTATS', 'ON', 'Automatic runstats', 0],
    ['AUTO_STMT_STATS', 'ON', 'Automatic statement statistics', 0],
    ['AUTO_REORG', 'OFF', 'Automatic reorganization', 0],
    ['STMT_CONC', 'OFF', 'Statement concentrator', 0],
    ['HADR_LOCAL_HOST', '', 'HADR local host name', 0],
    ['HADR_LOCAL_SVC', '', 'HADR local service name', 0],
    ['HADR_REMOTE_HOST', '', 'HADR remote host name', 0],
    ['HADR_REMOTE_SVC', '', 'HADR remote service name', 0],
    ['HADR_REMOTE_INST', '', 'HADR instance name of remote server', 0],
    ['HADR_TIMEOUT', '120', 'HADR timeout value', 0],
    ['HADR_SYNCMODE', 'NEARSYNC', 'HADR log write synchronization mode', 0],
    ['HADR_PEER_WINDOW', '0', 'HADR peer window duration (seconds)', 0]
  ];
  const DB_RANGE = {
    LOGPRIMARY: [2, 256], LOGSECOND: [-1, 254], LOGFILSIZ: [4, 1048572], LOCKTIMEOUT: [-1, 30000],
    CHNGPGS_THRES: [5, 99], DFT_QUERYOPT: [0, 9], LOGBUFSZ: [4, 131072], DLCHKTIME: [1000, 600000]
  };
  const DB_ENUM = {
    CUR_COMMIT: ['ON', 'DISABLED'], AUTO_MAINT: ['ON', 'OFF'], AUTO_RUNSTATS: ['ON', 'OFF'], AUTO_REORG: ['ON', 'OFF'],
    AUTO_TBL_MAINT: ['ON', 'OFF'], AUTO_DB_BACKUP: ['ON', 'OFF'], TRACKMOD: ['YES', 'NO'], SELF_TUNING_MEM: ['ON', 'OFF'],
    BLK_LOG_DSK_FUL: ['YES', 'NO'], STMT_CONC: ['OFF', 'LITERALS', 'COMMENTS'], LOGINDEXBUILD: ['ON', 'OFF'],
    HADR_SYNCMODE: ['SYNC', 'NEARSYNC', 'ASYNC', 'SUPERASYNC']
  };
  const ROW_LIMIT = { 4096: 4005, 8192: 8101, 16384: 16293, 32768: 32677 };

  const DEL_FILES = (() => {
    const emp = []; const first = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy', 'Ken', 'Laura', 'Mike', 'Nina', 'Oscar', 'Peggy', 'Quinn', 'Rita', 'Sam', 'Tina'];
    const dept = ['Sales', 'HR', 'IT', 'Finance', 'Ops'];
    for (let i = 1; i <= 20; i++) emp.push(`${i},"${first[i - 1]}","${dept[i % 5]}",${40000 + i * 2500},"2024-0${1 + (i % 9)}-${p2(1 + i)}"`);
    const sales = [];
    for (let i = 1; i <= 200; i++) sales.push(`${i},${1 + (i * 7) % 20},${(i * 37) % 500 + 10},"2025-${p2(1 + (i % 12))}-${p2(1 + (i % 28))}"`);
    return {
      '/home/db2inst1/data/employees.del': emp.join('\n') + '\n',
      '/home/db2inst1/data/sales.del': sales.join('\n') + '\n',
      '/home/db2inst1/data/README.txt': 'Sample data files for the labs.\nemployees.del : id,name,dept,salary,hired\nsales.del     : sale_id,emp_id,amount,sale_date\n'
    };
  })();

  /* ---------- the simulator ---------- */
  class Db2Sim {
    constructor(SQL, opts) {
      this.SQL = SQL; opts = opts || {};
      this.now = opts.now || (() => new Date());
      this.reset();
    }

    reset() {
      const homeDirs = ['/', '/home', '/home/db2inst1', '/home/db2inst1/data', '/tmp'];
      this.inst = { started: false, name: 'db2inst1', dbm: {}, registry: { DB2COMM: 'TCPIP' }, startTime: null };
      DBM_CFG.forEach((p) => { this.inst.dbm[p[0]] = p[1]; });
      this.dbs = {}; this.aliases = {};
      this.users = { db2inst1: 1, db2fenc1: 1, dasusr1: 1 };
      this.dirs = new Set(homeDirs);
      this.files = {};
      Object.keys(DEL_FILES).forEach((k) => { this.files[k] = { type: 'text', content: DEL_FILES[k] }; });
      this.sessions = {}; this.sid = 0; this.events = []; this.diag = []; this.lastTs = 0;
      this.hadrPeer = { host: 'primary' }; // which role this "server" has
      this.newSession();
    }

    newSession() {
      const id = ++this.sid;
      this.sessions[id] = { id, handle: 10 + id * 7, db: null, user: 'DB2INST1', autocommit: true, txn: false, pending: [], iso: 'CS', schema: 'DB2INST1', plan: null, forced: false, waiting: null, host: 'primary', stmtCount: 0 };
      return id;
    }

    /* ---- diag log ---- */
    diagLog(level, msg, fn) {
      this.diag.push({ ts: this.now(), level, msg, fn: fn || 'DB2 UDB, base sys utilities, sqleStartDbm, probe:911' });
      if (this.diag.length > 300) this.diag.shift();
    }

    /* ---- time ---- */
    uniqueTs() {
      let t = Math.floor(this.now().getTime() / 1000);
      if (t <= this.lastTs) t = this.lastTs + 1;
      this.lastTs = t; return new Date(t * 1000);
    }

    /* ---- command entry ---- */
    run(sid, raw) {
      const sess = this.sessions[sid]; if (!sess) return 'Unknown session';
      let line = String(raw || '').trim(); if (!line) return '';
      const parts = splitOutside(line, '|');
      let out;
      try { out = this._shell(sess, parts[0].trim()); }
      catch (e) { if (e.db2) { out = fmtErr(e); this.events.push({ cmd: line, ok: false, err: e.code, sid, ts: Date.now(), out: out.slice(0, 4000) }); sess.lastErr = e.code; this._afterEach(sess); return out; } throw e; }
      for (let i = 1; i < parts.length; i++) out = this._pipe(out, parts[i].trim());
      this.events.push({ cmd: line, ok: (!/^(?!SQL3109N|SQL3110N)(SQL|DB2|SQ)\d+[NC]\b/m.test(out) || /processing was successful/.test(out) || (/SQL3110N/.test(out) && !/^SQL0\d+N/m.test(out))) && !/^bash:|^\[simulator\]/.test(out), sid, ts: Date.now(), out: out.slice(0, 4000) });
      this._afterEach(sess);
      return out;
    }
    _afterEach(sess) { if (this.events.length > 2000) this.events.splice(0, 500); }

    _pipe(text, cmd) {
      const lines = String(text).split('\n');
      let m;
      if ((m = cmd.match(/^grep\s+(.*)$/))) {
        let args = m[1].trim(); let ci = false; let inv = false; let cnt = false;
        while (/^-[ivcE]+\s/.test(args + ' ')) { const f = args.match(/^-([ivcE]+)/)[1]; if (f.includes('i')) ci = true; if (f.includes('v')) inv = true; if (f.includes('c')) cnt = true; args = args.replace(/^-[ivcE]+\s*/, ''); }
        const pat = unq(args);
        let re; try { re = new RegExp(pat, ci ? 'i' : ''); } catch (e) { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ci ? 'i' : ''); }
        const res = lines.filter((l) => re.test(l) !== inv);
        return cnt ? String(res.length) : res.join('\n');
      }
      if ((m = cmd.match(/^head(?:\s+-n?\s*(\d+))?$/))) return lines.slice(0, parseInt(m[1] || '10', 10)).join('\n');
      if ((m = cmd.match(/^tail(?:\s+-n?\s*(\d+))?$/))) return lines.slice(-parseInt(m[1] || '10', 10)).join('\n');
      if (/^wc\s+-l$/.test(cmd)) return String(lines.filter((l, i) => l !== '' || i < lines.length - 1).length);
      if (/^(more|less|cat)$/.test(cmd)) return text;
      if (/^sort$/.test(cmd)) return lines.slice().sort().join('\n');
      return 'bash: ' + cmd.split(/\s+/)[0] + ': command not found';
    }

    /* ---- shell layer ---- */
    _shell(sess, line) {
      let m;
      const low = line.toLowerCase();
      if (low === 'clear') return '\u0000CLEAR';
      if (low === 'help' || low === '?') return this._help();
      if (low === 'whoami') return sess.user.toLowerCase();
      if (low === 'pwd') return '/home/db2inst1';
      if (low === 'hostname') return sess.host === 'standby' ? 'db2standby' : 'db2server';
      if (low === 'date') return this.now().toString();
      if (low === 'uptime') return ' 22:46:01 up 3 days, 1:12, 1 user, load average: 0.08, 0.04, 0.01';
      if (low === 'exit' || low === 'logout') { if (sess.host === 'standby') { sess.host = 'primary'; return 'logout\nConnection to db2standby closed.'; } return 'logout (close the tab or keep practising - this is a simulated shell)'; }
      if ((m = line.match(/^ssh\s+(?:\S+@)?(\S+)$/))) {
        if (/standby/i.test(m[1])) { if (!this._anyHadr()) return 'ssh: connect to host ' + m[1] + ' port 22: No route to host\n(Configure and start HADR first - see Module 12.)'; sess.host = 'standby'; return 'Last login: ' + this.now().toDateString() + ' from 10.0.0.5\nYou are now on the HADR standby server (simulated).'; }
        return 'ssh: Could not resolve hostname ' + m[1] + ': Name or service not known';
      }
      if ((m = line.match(/^echo\s+(.*)$/))) return this._echo(m[1]);
      if ((m = line.match(/^(?:sudo\s+)?useradd\s+(\S+)$/))) { this.users[m[1].toLowerCase()] = 1; return ''; }
      if ((m = line.match(/^id\s+(\S+)$/))) return this.users[m[1].toLowerCase()] ? 'uid=1001(' + m[1] + ') gid=1001(' + m[1] + ') groups=1001(' + m[1] + ')' : 'id: ‘' + m[1] + '’: no such user';
      if ((m = line.match(/^mkdir(?:\s+-p)?\s+(.+)$/))) { m[1].split(/\s+/).forEach((d) => this._mkdirs(d)); return ''; }
      if ((m = line.match(/^touch\s+(\S+)$/))) { if (!this.files[m[1]]) this.files[m[1]] = { type: 'text', content: '' }; this._mkdirs(m[1].replace(/\/[^/]*$/, '') || '/'); return ''; }
      if ((m = line.match(/^rm(?:\s+-rf?)?\s+(\S+)$/))) { delete this.files[m[1]]; return ''; }
      if ((m = line.match(/^ls(?:\s+-[a-zA-Z]+)?(?:\s+(\S+))?$/))) return this._ls(m[1] || '/home/db2inst1');
      if ((m = line.match(/^cat\s+(\S+)$/))) { const f = this.files[m[1]]; if (!f) return 'cat: ' + m[1] + ': No such file or directory'; return f.type === 'text' ? f.content.replace(/\n$/, '') : 'cat: ' + m[1] + ': binary file'; }
      if ((m = line.match(/^head\s+(?:-n?\s*(\d+)\s+)?(\S+)$/))) { const f = this.files[m[2]]; if (!f) return 'head: cannot open \'' + m[2] + '\' for reading: No such file or directory'; return f.content.split('\n').slice(0, parseInt(m[1] || '10', 10)).join('\n'); }
      if ((m = line.match(/^wc\s+-l\s+(\S+)$/))) { const f = this.files[m[1]]; return f ? f.content.split('\n').filter(Boolean).length + ' ' + m[1] : 'wc: ' + m[1] + ': No such file or directory'; }
      if ((m = line.match(/^df(?:\s+-h)?$/))) return 'Filesystem      Size  Used Avail Use% Mounted on\noverlay          50G   12G   36G  25% /\n/dev/sdb1       200G   31G  160G  17% /db2data';
      if (/^db2ilist$/.test(low)) return this.inst.name;
      if (/^db2level$/.test(low)) return this._db2level();
      if (/^db2start$/.test(low)) return this._db2start();
      if ((m = low.match(/^db2stop(\s+force)?$/))) return this._db2stop(!!m[1]);
      if (/^db2set(\s|$)/.test(low)) return this._db2set(line);
      if (/^db2licm\s+-l/.test(low)) return 'Product name:                     "DB2 Community Edition"\nLicense type:                     "Community"\nExpiry date:                      "Permanent"\nProduct identifier:               "db2dec"\nVersion information:              "12.1"\nMax amount of memory (GB):        "16"\nMax number of cores:              "4"';
      if (/^db2pd(\s|$)/.test(low)) return this.cmdDb2pd(sess, line);
      if (/^db2exfmt(\s|$)/.test(low)) return this.cmdExfmt(sess, line);
      if (/^db2expln(\s|$)/.test(low)) return this.cmdExpln(sess, line);
      if (/^db2look(\s|$)/.test(low)) return this.cmdLook(sess, line);
      if (/^db2diag(\s|$)/.test(low)) return this.cmdDiag(line);
      if (/^db2ckbkp(\s|$)/.test(low)) return this.cmdCkbkp(line);
      if (/^db2support(\s|$)/.test(low)) return 'Collecting system information ...\n(simulated) db2support.zip would be created in the current directory.\nSend it to IBM Support when you open a case (PMR).';
      if (/^db2(\s|$)/.test(low) || low === 'db2') return this._db2prefix(sess, line);
      if (/^(ps|top|vi|nano|man|sudo|yum|apt|apt-get|dnf)(\s|$)/.test(low)) return 'bash: ' + low.split(/\s+/)[0] + ': not available in the simulated shell (try "help")';
      return this._clpOrSql(sess, line);
    }

    _help() {
      return [
        'Db2 DBA Academy - simulated Linux shell + Db2 CLP',
        '',
        'Type Db2 commands exactly as on a real server, with or without the "db2" prefix:',
        '  db2start | db2stop [force] | db2level | db2set | db2pd -db <name> -bufferpools',
        '  db2 create database <name> | db2 connect to <name> | db2 list db directory',
        '  db2 "select * from syscat.tablespaces"   (quotes optional)',
        '  db2 get dbm cfg | db2 get db cfg for <db> | db2 update db cfg for <db> using <p> <v>',
        '  db2 backup/restore/rollforward ... | db2 export/import/load ... | db2 runstats/reorg ...',
        '  db2look -d <db> -e | db2exfmt -d <db> -1 | db2diag | db2ckbkp <file>',
        'Shell helpers: ls cat head wc mkdir echo > file | grep -i | more   useradd <user>   clear',
        'Tip: press Tab to complete, Up/Down for history. Ask for a hint in the Lab panel.',
        'Use the second terminal tab to act as a second application (locking labs).'
      ].join('\n');
    }

    _echo(rest) {
      let m = rest.match(/^(.*?)\s*(>>?)\s*(\S+)$/);
      const strip = (s) => unq(s.trim()).replace(/\\n/g, '\n');
      if (!m) return strip(rest);
      const text = strip(m[1]); const path = m[3];
      this._mkdirs(path.replace(/\/[^/]*$/, '') || '/');
      const f = this.files[path];
      if (m[2] === '>>' && f && f.type === 'text') f.content += text + '\n'; else this.files[path] = { type: 'text', content: text + '\n' };
      return '';
    }
    _mkdirs(p) { let acc = ''; p.split('/').filter(Boolean).forEach((s) => { acc += '/' + s; this.dirs.add(acc); }); }
    _dirExists(p) { p = (p || '/').replace(/\/+$/, '') || '/'; return this.dirs.has(p); }
    _ls(path) {
      path = path.replace(/\/+$/, '') || '/';
      if (this.files[path]) return path;
      if (!this._dirExists(path)) return "ls: cannot access '" + path + "': No such file or directory";
      const pre = path === '/' ? '/' : path + '/'; const names = new Set();
      Object.keys(this.files).forEach((f) => { if (f.startsWith(pre)) names.add(f.slice(pre.length).split('/')[0]); });
      this.dirs.forEach((d) => { if (d !== path && d.startsWith(pre)) names.add(d.slice(pre.length).split('/')[0]); });
      return Array.from(names).sort().join('\n');
    }

    /* ---- db2 prefix & options ---- */
    _db2prefix(sess, line) {
      let rest = line.replace(/^db2\s*/i, '');
      if (!rest) return 'Db2 CLP interactive mode is not needed here: just type commands (with or without the "db2" prefix). Use "quit" to leave.\n(Command Line Processor for Db2 simulated)';
      let noCommit = false; let noHdr = false;
      for (;;) {
        const m = rest.match(/^([+-][a-zA-Z]+)(?:\s+|$)/);
        if (!m) break;
        if (m[1] === '+c') noCommit = true; else if (m[1] === '-x') noHdr = true;
        rest = rest.slice(m[0].length);
      }
      rest = rest.trim();
      if (/^["']/.test(rest) && rest.endsWith(rest[0])) rest = rest.slice(1, -1);
      const saved = sess.autocommit; const savedHdr = sess.noHdr;
      if (noCommit) sess.autocommit = false; if (noHdr) sess.noHdr = true;
      try { return this._clpOrSql(sess, rest); }
      finally { if (noCommit) { sess.autocommit = saved; } sess.noHdr = savedHdr; }
    }

    _anyHadr() { return Object.values(this.dbs).some((d) => d.hadr); }

    /* ---- instance commands ---- */
    _db2level() {
      return 'DB21085I  This instance or install (instance name, where applicable: "db2inst1") uses\n"64" bits and Db2 code release "SQL12010" with level identifier "0F0A0107".\nInformational tokens are "Db2 v12.1.0.0", "s2411221234", "DYN2411221234AMD64", and Fix Pack "0".\nProduct is installed at "/opt/ibm/db2/V12.1".\n(simulated output)';
    }
    _db2start() {
      if (this.inst.started) return fmtErr({ code: 'SQL1026N', message: 'The database manager is already active.', state: '' }).replace(/ {2}SQLSTATE=$/, '');
      this.inst.started = true; this.inst.startTime = this.now();
      this.diagLog('Event', 'ADM7513W  Database manager has started.');
      const d = this.now(); const stamp = p2(d.getMonth() + 1) + '/' + p2(d.getDate()) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
      return stamp + '     0   0   SQL1063N  DB2START processing was successful.\nSQL1063N  DB2START processing was successful.';
    }
    _db2stop(force) {
      if (!this.inst.started) return 'SQL1032N  No start database manager command was issued.  SQLSTATE=57019';
      const active = Object.values(this.sessions).filter((s) => s.db);
      if (active.length && !force) return 'SQL1025N  The database manager was not stopped because databases are still active.';
      if (force) active.forEach((s) => this._disconnect(s, false));
      Object.values(this.dbs).forEach((d) => { d.activated = false; d.connections = 0; });
      this.inst.started = false; this.diagLog('Event', 'ADM7514W  Database manager has stopped.');
      const d = this.now(); const stamp = p2(d.getMonth() + 1) + '/' + p2(d.getDate()) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
      return stamp + '     0   0   SQL1064N  DB2STOP processing was successful.\nSQL1064N  DB2STOP processing was successful.';
    }
    _db2set(line) {
      const args = line.replace(/^db2set\s*/i, '').trim();
      const reg = this.inst.registry;
      if (!args) return Object.keys(reg).sort().map((k) => k + '=' + reg[k]).join('\n');
      if (/^-all$/i.test(args)) return Object.keys(reg).sort().map((k) => '[i] ' + k + '=' + reg[k]).join('\n');
      if (/^-lr$/i.test(args)) return 'DB2ACCOUNTNAME\nDB2AUTOSTART\nDB2CODEPAGE\nDB2COMM\nDB2DBDFT\nDB2FODC\nDB2INSTDEF\nDB2LOCK_TO_RB\nDB2_PARALLEL_IO\nDB2_USE_ALTERNATE_PAGE_CLEANING\nDB2_WORKLOAD';
      let m = args.match(/^(\w+)=(.*)$/);
      if (m) { if (m[2] === '') delete reg[U(m[1])]; else reg[U(m[1])] = m[2]; return ''; }
      m = args.match(/^(\w+)$/);
      if (m) return reg[U(m[1])] !== undefined ? reg[U(m[1])] : '';
      return 'DBI1303W  Variable not set.';
    }

    /* ---- config printing ---- */
    _cfgLine(desc, name, val) {
      const left = (' ' + desc).padEnd(Math.max(1, 57 - name.length - 2)) + '(' + name + ')';
      return left.padEnd(57) + ' = ' + val;
    }
    _getDbmCfg() {
      const out = ['', '           Database Manager Configuration', '', '     Node type = Enterprise Server Edition with local and remote clients', '',
        ' Database manager configuration release level            = 0x1500', ''];
      DBM_CFG.forEach((p) => out.push(this._cfgLine(p[2], p[0], this.inst.dbm[p[0]])));
      return out.join('\n');
    }
    _resolveParams(tokens, table, range, enums, what) {
      const pairs = [];
      for (let i = 0; i < tokens.length; i += 2) {
        const name = U(tokens[i]); const val = tokens[i + 1];
        if (!table.find((p) => p[0] === name)) fail('SQL5112N', 'The configuration parameter "' + name + '" is not valid for this ' + what + '.', '42615');
        if (val === undefined) fail('SQL0104N', 'An unexpected token "END-OF-STATEMENT" was found following "' + name + '".  Expected tokens may include:  "<value>".', '42601');
        let v = String(val);
        const def = table.find((p) => p[0] === name)[1];
        if (/^-?\d+$/.test(def) && def !== '' && !/^AUTOMATIC$/i.test(v)) {
          if (!/^-?\d+$/.test(v)) fail('SQL5130N', 'The value "' + v + '" specified for configuration parameter "' + name + '" is not a valid number.', '42815');
          if (range[name] && (+v < range[name][0] || +v > range[name][1])) fail('SQL5130N', 'The value "' + v + '" specified for configuration parameter "' + name + '" is out of range. Valid range: ' + range[name][0] + ' - ' + range[name][1] + '.', '42815');
        }
        if (enums && enums[name]) { v = U(v); if (!enums[name].includes(v)) fail('SQL5130N', 'The value "' + v + '" specified for "' + name + '" is not valid. Valid values: ' + enums[name].join(', ') + '.', '42815'); }
        if (/^(DFT_MON_|AUTO_)/.test(name)) v = U(v);
        pairs.push([name, v]);
      }
      return pairs;
    }
    _updDbmCfg(rest) {
      const m = rest.match(/^(?:for\s+\S+\s+)?using\s+(.*)$/i); if (!m) fail('SQL0104N', 'An unexpected token was found. Expected: UPDATE DBM CFG USING <parameter> <value>', '42601');
      const pairs = this._resolveParams(m[1].trim().split(/\s+/), DBM_CFG, DBM_RANGE, null, 'database manager');
      let restart = false;
      pairs.forEach(([n, v]) => { this.inst.dbm[n] = v; if (DBM_CFG.find((p) => p[0] === n)[3]) restart = true; });
      let out = 'DB20000I  The UPDATE DATABASE MANAGER CONFIGURATION command completed successfully.';
      if (restart) out += '\nSQL1362W  One or more of the parameters submitted for immediate modification were not changed dynamically. Client changes will not be effective until the next time the application is started or the TERMINATE command has been issued. Server changes will not be effective until the next DB2START command.';
      return out;
    }
    _getDbCfg(db) {
      const c = db.cfg; const out = ['', '       Database Configuration for Database ' + db.alias, '',
        ' Database configuration release level                    = 0x1500', ' Database release level                                  = 0x1500', '',
        ' Database territory                                      = ' + db.territory, ' Database code page                                      = 1208',
        ' Database code set                                       = ' + db.codeset, ' Database country/region code                            = 1',
        ' Database collating sequence                             = IDENTITY', ' Database page size                                      = ' + db.pagesize, '',
        ' Backup pending                                          = ' + (db.backupPending ? 'YES' : 'NO'),
        ' Rollforward pending                                     = ' + (db.rollfwdPending ? 'DATABASE' : 'NO'),
        ' Restore pending                                         = NO', ' Database is consistent                                   = YES',
        ' Log retain for recovery status                          = ' + (this._archiving(db) ? 'RECOVERY' : 'NO'),
        ' User exit for logging status                            = ' + (this._archiving(db) ? 'YES' : 'NO'), ''];
      DB_CFG.forEach((p) => {
        let v = c[p[0]];
        if (p[0] === 'LOGPRIMARY' || p[0] === 'LOGSECOND' || p[0] === 'LOGFILSIZ') out.push(this._cfgLine(p[2], p[0], v));
        else out.push(this._cfgLine(p[2], p[0], v));
        if (p[0] === 'NEWLOGPATH') out.push(' Path to log files                                       = /home/db2inst1/db2inst1/NODE0000/SQL00001/LOGSTREAM0000/');
      });
      return out.join('\n');
    }
    _archiving(db) { const v = db.cfg.LOGARCHMETH1; return v && v !== 'OFF'; }
    _updDbCfg(sess, rest) {
      const m = rest.match(/^for\s+(\S+)\s+using\s+(.*)$/i) || rest.match(/^using\s+(.*)$/i);
      if (!m) fail('SQL0104N', 'An unexpected token was found. Expected: UPDATE DB CFG FOR <db> USING <parameter> <value>', '42601');
      let dbName; let tail;
      if (m.length === 3) { dbName = m[1]; tail = m[2]; } else { if (!sess.db) fail('SQL1024N', 'A database connection does not exist.', '08003'); dbName = sess.db.alias; tail = m[1]; }
      const db = this._findDb(dbName);
      const pairs = this._resolveParams(tail.trim().split(/\s+/), DB_CFG, DB_RANGE, DB_ENUM, 'database');
      let dyn = false; const wasArch = this._archiving(db);
      pairs.forEach(([n, v]) => {
        if (n === 'LOGARCHMETH1' || n === 'LOGARCHMETH2') {
          const up = U(v);
          if (!/^(OFF|LOGRETAIN)$/.test(up)) {
            const mm = v.match(/^(DISK|TSM|VENDOR|USEREXIT):(.*)$/i);
            if (!mm) fail('SQL5099N', 'The value "' + v + '" indicated by the parameter "' + n + '" is not valid. Reason code = "1" (use OFF, LOGRETAIN, DISK:<path>, TSM or VENDOR).', '42616');
            if (/^DISK$/i.test(mm[1]) && !this._dirExists(mm[2])) fail('SQL5099N', 'The value "' + v + '" indicated by the parameter "' + n + '" is not valid. Reason code = "2" (path does not exist: create it with mkdir -p ' + mm[2] + ').', '42616');
            db.cfg[n] = 'DISK:' + mm[2].replace(/\/$/, '') + (/^DISK$/i.test(mm[1]) ? '/' : '');
            db.cfg[n] = mm[1].toUpperCase() + ':' + mm[2].replace(/\/+$/, '') + '/';
          } else db.cfg[n] = up;
        } else db.cfg[n] = v;
        if (DB_CFG.find((p) => p[0] === n)[3] && (db.connections > 0 || db.activated)) dyn = true;
      });
      if (!wasArch && this._archiving(db)) { db.backupPending = true; }
      if (wasArch && !this._archiving(db)) { db.backupPending = true; }
      let out = 'DB20000I  The UPDATE DATABASE CONFIGURATION command completed successfully.';
      if (dyn) out += '\nSQL1363W  One or more of the parameters submitted for immediate modification were not changed dynamically. For these configuration parameters, the database must be shutdown and reactivated before the configuration parameter changes become effective.';
      return out;
    }

    /* ---- database directory ---- */
    _findDb(name) {
      const n = U(name); const real = this.aliases[n];
      if (!real || !this.dbs[real]) fail('SQL1013N', 'The database alias name or database name "' + n + '" could not be found.', '42705');
      const db = this.dbs[real]; db.alias = n; return db;
    }
    _makeDb(name, opts) {
      const created = this.now();
      const base = '/home/db2inst1/db2inst1/NODE0000/' + name + '/';
      const db = {
        name, alias: name, created: created.getTime(), path: opts.path || '/home/db2inst1', pagesize: opts.pagesize || 4096,
        codeset: opts.codeset || 'UTF-8', territory: opts.territory || 'US', restrictive: !!opts.restrictive, autoStorage: opts.autoStorage !== false,
        cfg: {}, bufferpools: {}, tablespaces: {}, tables: {}, indexes: {}, views: {}, schemas: {}, roles: {}, auth: [], tabauth: [],
        locks: {}, backups: [], logs: [], hist: [], connections: 0, activated: false, backupPending: false, rollfwdPending: false, preImage: null,
        txnOwner: null, hadr: null, stats: { commits: 0, rollbacks: 0, rowsRead: 0, rowsModified: 0, lockWaits: 0, lockTimeouts: 0, deadlocks: 0 },
        bpStats: {}, stmtStats: {}, tabStats: {}, logSeq: 0, logCount: 0, archived: [], nextTsId: 3, trackmodSince: null, lastFullBackup: null, sql: new this.SQL.Database()
      };
      DB_CFG.forEach((p) => { db.cfg[p[0]] = p[1]; });
      db.bufferpools.IBMDEFAULTBP = { id: 1, size: -2, pagesize: db.pagesize, created };
      const mk = (id, nm, type, content, ext, c) => ({ id, name: nm, type, content, auto: true, pagesize: db.pagesize, extent: ext, prefetch: -1, bp: 'IBMDEFAULTBP', containers: [{ id: 0, name: base + 'T' + String(id).padStart(7, '0') + '/C0000000.' + c, type: 'File', pages: 4096 }], initial: 4096, autoresize: true, maxsize: 'NONE', increase: '10 PERCENT', state: 0, created: created.getTime() });
      db.tablespaces.SYSCATSPACE = mk(0, 'SYSCATSPACE', 'DMS', 'ANY', 4, 'CAT'); db.tablespaces.SYSCATSPACE.initial = db.tablespaces.SYSCATSPACE.containers[0].pages = 16384;
      db.tablespaces.TEMPSPACE1 = mk(1, 'TEMPSPACE1', 'SMS', 'SYSTEMP', 4, 'TMP'); db.tablespaces.TEMPSPACE1.initial = 1;
      db.tablespaces.USERSPACE1 = mk(2, 'USERSPACE1', 'DMS', 'LARGE', 4, 'LRG'); db.tablespaces.USERSPACE1.initial = db.tablespaces.USERSPACE1.containers[0].pages = 8192;
      db.schemas.DB2INST1 = { owner: 'DB2INST1', created: created.getTime() };
      db.schemas.SYSIBM = { owner: 'SYSIBM', created: created.getTime() };
      db.schemas.SYSCAT = { owner: 'SYSIBM', created: created.getTime() };
      db.auth.push({ grantee: 'DB2INST1', gtype: 'U', priv: 'DBADM', grantor: 'SYSIBM' }, { grantee: 'DB2INST1', gtype: 'U', priv: 'DATAACCESS', grantor: 'SYSIBM' }, { grantee: 'DB2INST1', gtype: 'U', priv: 'ACCESSCTRL', grantor: 'SYSIBM' }, { grantee: 'DB2INST1', gtype: 'U', priv: 'SECADM', grantor: 'SYSIBM' });
      if (!db.restrictive) db.auth.push({ grantee: 'PUBLIC', gtype: 'G', priv: 'CONNECT', grantor: 'SYSIBM' }, { grantee: 'PUBLIC', gtype: 'G', priv: 'CREATETAB', grantor: 'SYSIBM' }, { grantee: 'PUBLIC', gtype: 'G', priv: 'BINDADD', grantor: 'SYSIBM' }, { grantee: 'PUBLIC', gtype: 'G', priv: 'IMPLICIT_SCHEMA', grantor: 'SYSIBM' });
      this._prep(db.sql);
      return db;
    }
    _prep(sql) {
      sql.run('PRAGMA foreign_keys = ON');
      const f = (n, fn) => { try { sql.create_function(n, fn); } catch (e) { /* ignore */ } };
      const self = this;
      f('sim_ts', () => { const d = self.now(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '-' + p2(d.getHours()) + '.' + p2(d.getMinutes()) + '.' + p2(d.getSeconds()) + '.' + String(d.getMilliseconds() * 1000).padStart(6, '0'); });
      f('sim_date', () => { const d = self.now(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); });
      f('sim_time', () => { const d = self.now(); return p2(d.getHours()) + '.' + p2(d.getMinutes()) + '.' + p2(d.getSeconds()); });
      f('year', (x) => (x == null ? null : parseInt(String(x).slice(0, 4), 10)));
      f('month', (x) => (x == null ? null : parseInt(String(x).slice(5, 7), 10)));
      f('day', (x) => (x == null ? null : parseInt(String(x).slice(8, 10), 10)));
      f('ucase', (x) => (x == null ? null : String(x).toUpperCase()));
      f('lcase', (x) => (x == null ? null : String(x).toLowerCase()));
      f('value', (a, b) => (a == null ? b : a));
      f('posstr', (a, b) => (a == null || b == null ? null : String(a).indexOf(String(b)) + 1));
      f('float', (x) => (x == null ? null : Number(x)));
      f('double', (x) => (x == null ? null : Number(x)));
      f('decimal', (x) => (x == null ? null : Number(x)));
      f('integer', (x) => (x == null ? null : Math.trunc(Number(x))));
      f('mod', (a, b) => (a == null || b == null ? null : a % b));
      f('rand', () => Math.random());
      f('digits', (x) => (x == null ? null : String(Math.abs(x))));
    }
    _cmdCreateDb(sess, rest) {
      const m = rest.match(/^(?:database|db)\s+(\S+)(.*)$/i); if (!m) fail('SQL0104N', 'An unexpected token was found. Expected: CREATE DATABASE <name>', '42601');
      const name = U(m[1]); const tail = m[2] || '';
      if (!/^[A-Z][A-Z0-9_@#$]{0,7}$/.test(name)) fail('SQL1006N', 'The database name or alias "' + name + '" is not valid (1-8 characters, must start with a letter).', '2E000');
      if (this.aliases[name]) fail('SQL1005N', 'The database alias "' + name + '" already exists in either the local database directory or system database directory.', '51026');
      const opts = {};
      let mm;
      if ((mm = tail.match(/automatic\s+storage\s+(yes|no)/i))) opts.autoStorage = /yes/i.test(mm[1]);
      if ((mm = tail.match(/\bpagesize\s+(\d+\s*k?)/i))) { opts.pagesize = pageNum(mm[1]); if (![4096, 8192, 16384, 32768].includes(opts.pagesize)) fail('SQL0104N', 'PAGESIZE must be 4096, 8192, 16384 or 32768 (or 4K/8K/16K/32K).', '42601'); }
      if ((mm = tail.match(/codeset\s+(\S+)/i))) opts.codeset = mm[1];
      if ((mm = tail.match(/territory\s+(\S+)/i))) opts.territory = mm[1];
      if (/\brestrictive\b/i.test(tail)) opts.restrictive = true;
      if ((mm = tail.match(/\bon\s+(\/\S+)/i))) { opts.path = mm[1].replace(/\/+$/, ''); if (!this._dirExists(opts.path)) fail('SQL1031N', 'The database directory cannot be found on the indicated file system.', '58031'); }
      const db = this._makeDb(name, opts);
      this.dbs[name] = db; this.aliases[name] = name;
      this.diagLog('Event', 'ADM1500W  Database "' + name + '" has been created.');
      return 'DB20000I  The CREATE DATABASE command completed successfully.';
    }
    _cmdDropDb(sess, rest) {
      const m = rest.match(/^(?:database|db)\s+(\S+)/i);
      const db = this._findDb(m[1]);
      if (db.connections > 0 || db.activated) fail('SQL1035N', 'The database is currently in use.', '57019');
      delete this.dbs[db.name];
      Object.keys(this.aliases).forEach((a) => { if (this.aliases[a] === db.name) delete this.aliases[a]; });
      try { db.sql.close(); } catch (e) { /* ignore */ }
      return 'DB20000I  The DROP DATABASE command completed successfully.';
    }
    _listDbDir() {
      const al = Object.keys(this.aliases).sort();
      if (!al.length) return 'SQL1057W  The system database directory is empty.  SQLSTATE=01606';
      const out = ['', ' System Database Directory', '', ' Number of entries in the directory = ' + al.length, ''];
      al.forEach((a, i) => {
        const db = this.dbs[this.aliases[a]];
        out.push('Database ' + (i + 1) + ' entry:', '', ' Database alias                       = ' + a, ' Database name                        = ' + db.name, ' Local database directory             = ' + db.path, ' Database release level               = 15.00', ' Comment                              =', ' Directory entry type                 = Indirect', ' Catalog database partition number    = 0', ' Alternate server hostname            =', ' Alternate server port number         =', '');
      });
      return out.join('\n');
    }

    /* ---- connections ---- */
    _cmdConnect(sess, rest) {
      if (/^reset$/i.test(rest)) { this._disconnect(sess, true); return 'DB20000I  The SQL command completed successfully.'; }
      const m = rest.match(/^to\s+(\S+)(?:\s+user\s+(\S+)(?:\s+using\s+(\S+))?)?/i);
      if (!m) { if (!sess.db) fail('SQL1024N', 'A database connection does not exist.', '08003'); return this._connInfo(sess); }
      const db = this._findDb(m[1]);
      let user = m[2] ? U(m[2]) : 'DB2INST1';
      if (m[2] && !this.users[m[2].toLowerCase()]) fail('SQL1403N', 'The username and/or password supplied is incorrect.', '08004');
      if (m[2] && !m[3]) fail('SQL1403N', 'The username and/or password supplied is incorrect.', '08004');
      if (db.hadr && this._hadrRole(db, sess) === 'STANDBY') fail('SQL1776N', 'The command cannot be issued on an HADR database. Reason code = "1" (this server currently holds the HADR STANDBY role; connect to the primary).', '55019');
      if (db.backupPending) fail('SQL1116N', 'A connection to or activation of database "' + db.alias + '" cannot be made because of BACKUP PENDING.', '57019');
      if (db.rollfwdPending) fail('SQL1117N', 'A connection to or activation of database "' + db.alias + '" cannot be made because of ROLL-FORWARD PENDING.', '57019');
      if (!this._hasDbPriv(db, user, 'CONNECT')) fail('SQL1060N', 'User "' + user + '" does not have the CONNECT privilege.', '08004');
      if (sess.db) this._disconnect(sess, true);
      if (db.connections === 0 && !db.activated) this._coldStart(db);
      sess.db = db; sess.user = user; sess.schema = user; sess.forced = false; db.connections++; db.activated = db.activated || false;
      this.diagLog('Event', 'ADM1501I  Application "' + sess.handle + '" connected to "' + db.alias + '" as ' + user + '.');
      return this._connInfo(sess);
    }
    _connInfo(sess) {
      return ['', '   Database Connection Information', '', ' Database server        = DB2/LINUXX8664 12.1.0', ' SQL authorization ID   = ' + sess.user, ' Local database alias   = ' + sess.db.alias, ''].join('\n');
    }
    _disconnect(sess, commit) {
      const db = sess.db; if (!db) return;
      if (sess.txn) { if (commit) this._commit(sess); else this._rollback(sess); }
      this._releaseLocks(db, sess.id);
      db.connections = Math.max(0, db.connections - 1); sess.db = null; sess.user = 'DB2INST1'; sess.schema = 'DB2INST1'; sess.txn = false;
    }
    _needConn(sess) {
      if (!this.inst.started) fail('SQL1032N', 'No start database manager command was issued.', '57019');
      if (sess.forced) { sess.forced = false; sess.db = null; fail('SQL1224N', 'The database manager is not able to accept new requests, has terminated all requests in progress, or has terminated the specified request because of an error or a forced interrupt.', '55032'); }
      if (!sess.db) fail('SQL1024N', 'A database connection does not exist.', '08003');
      return sess.db;
    }
    _needStarted() { if (!this.inst.started) fail('SQL1032N', 'No start database manager command was issued.', '57019'); }

    /* ---- transaction + locks ---- */
    _beginTxnIfNeeded(sess, db) {
      if (db.txnOwner === null) {
        db.preImage = db.sql.export(); this._prep(db.sql);
        db.sql.run('BEGIN'); db.txnOwner = sess.id;
      }
    }
    _commit(sess) {
      const db = sess.db; if (!db) return;
      if (db.txnOwner === sess.id) { db.sql.run('COMMIT'); db.txnOwner = null; db.preImage = null; }
      sess.pending.forEach((l) => { this._logRecord(db, l); }); if (sess.pending.length) db.stats.commits++;
      sess.pending = []; sess.txn = false; this._releaseLocks(db, sess.id);
    }
    _rollback(sess) {
      const db = sess.db; if (!db) return;
      if (db.txnOwner === sess.id) { try { db.sql.run('ROLLBACK'); } catch (e) { /* ignore */ } db.txnOwner = null; db.preImage = null; this._syncMeta(db); }
      if (sess.pending.length) db.stats.rollbacks++;
      sess.pending = []; sess.txn = false; this._releaseLocks(db, sess.id);
    }
    _releaseLocks(db, sid) { Object.keys(db.locks).forEach((t) => { if (db.locks[t].sid === sid) delete db.locks[t]; }); Object.values(this.sessions).forEach((s) => { if (s.waiting && s.waiting.onSid === sid) s.waiting = null; }); }
    _logRecord(db, rec) {
      db.logs.push(rec); db.logCount++;
      if (db.logCount % 5 === 0) this._rollLog(db);
    }
    _logName(n) { return 'S' + String(n).padStart(7, '0') + '.LOG'; }
    _rollLog(db) {
      if (this._archiving(db) && db.cfg.LOGARCHMETH1.startsWith('DISK:')) {
        const base = db.cfg.LOGARCHMETH1.slice(5).replace(/\/+$/, '') + '/db2inst1/' + db.name + '/NODE0000/LOGSTREAM0000/C0000000/';
        this._mkdirs(base);
        const fn = base + this._logName(db.logSeq);
        this.files[fn] = { type: 'log', db: db.name, seq: db.logSeq, size: 4096000 };
        db.archived.push(fn);
      }
      db.logSeq++;
    }
    _lockCheck(sess, db, tables, mode) { // mode 'R' or 'W'
      for (const t of tables) {
        const L = db.locks[t];
        if (!L || L.sid === sess.id) continue;
        const holder = this.sessions[L.sid];
        if (mode === 'R') {
          if (sess.iso === 'UR') continue;
          if (db.cfg.CUR_COMMIT === 'ON' && L.mode === 'X' && db.preImage) return { snapshot: true };
        }
        // deadlock detection
        if (holder && holder.waiting && holder.waiting.onSid === sess.id) {
          db.stats.deadlocks++; this._rollback(sess); sess.waiting = null;
          this.diagLog('Warning', 'ADM5502W  Deadlock detected; application handle ' + sess.handle + ' rolled back as victim.');
          fail('SQL0911N', 'The current transaction has been rolled back because of a deadlock or timeout.  Reason code "2".', '40001');
        }
        db.stats.lockWaits++;
        const to = parseInt(db.cfg.LOCKTIMEOUT, 10);
        if (to >= 0) {
          db.stats.lockTimeouts++; this._rollback(sess); sess.waiting = null;
          this.diagLog('Warning', 'ADM5501I  Lock timeout for application handle ' + sess.handle + ' on table ' + t + '.');
          fail('SQL0911N', 'The current transaction has been rolled back because of a deadlock or timeout.  Reason code "68".', '40001');
        }
        sess.waiting = { onSid: L.sid, table: t, since: Date.now() };
        fail('SQLWAIT', '[simulator] This statement is WAITING for a lock held by application handle ' + (holder ? holder.handle : '?') + ' on table ' + t + '.\nWith LOCKTIMEOUT = -1 (the default) a real Db2 would wait indefinitely. Open the other terminal and COMMIT/ROLLBACK there (or FORCE APPLICATION), or set LOCKTIMEOUT to a positive value. Re-run the statement afterwards.', '');
      }
      return null;
    }
    _hasDbPriv(db, user, priv) {
      if (user === 'DB2INST1') return true;
      const roles = this._rolesOf(db, user);
      return db.auth.some((a) => (a.priv === priv || a.priv === 'DBADM' && priv !== 'SECADM') && (a.grantee === user || a.grantee === 'PUBLIC' || roles.has(a.grantee)));
    }
    _rolesOf(db, user) {
      const s = new Set(); Object.keys(db.roles).forEach((r) => { if (db.roles[r].members.includes(user)) s.add(r); }); return s;
    }
    _hasTabPriv(db, user, table, priv) {
      if (user === 'DB2INST1') return true;
      const t = db.tables[table]; if (t && t.owner === user) return true;
      if (this._hasDbPriv(db, user, 'DBADM') && db.auth.some((a) => a.priv === 'DBADM' && a.grantee === user)) return true;
      if (db.auth.some((a) => a.priv === 'DATAACCESS' && a.grantee === user)) return true;
      const roles = this._rolesOf(db, user);
      return db.tabauth.some((a) => a.table === table && a.priv === priv && (a.grantee === user || a.grantee === 'PUBLIC' || roles.has(a.grantee)));
    }

    /* ---- command classification ---- */
    _clpOrSql(sess, line) {
      line = line.trim().replace(/;\s*$/, '');
      if (!line) return '';
      const l = line.replace(/\s+/g, ' ').toLowerCase();
      let m;
      if (l === 'quit' || l === 'q') return '';
      if (l === 'terminate') { this._disconnect(sess, true); return 'DB20000I  The TERMINATE command completed successfully.'; }
      if (/^connect(\s|$)/.test(l)) { this._needStarted(); return this._cmdConnect(sess, line.replace(/^connect\s*/i, '').trim()); }
      if (/^get connection state$/.test(l)) {
        if (!sess.db) return ['', '   Database Connection State', '', ' Connection state       = Connectable and Unconnected', ' Connection mode        = ', ' Local database alias   = ', ' Database name          = ', ' Hostname               = ', ' Service name           = ', ''].join('\n');
        return ['', '   Database Connection State', '', ' Connection state       = Connectable and Connected', ' Connection mode        = SHARE', ' Local database alias   = ' + sess.db.alias, ' Database name          = ' + sess.db.name, ' Hostname               = ', ' Service name           = ', ''].join('\n');
      }
      if (/^get instance$/.test(l)) return '\n The current database manager instance is:  ' + this.inst.name + '\n';
      if (/^get (dbm|database manager) (cfg|configuration)/.test(l)) return this._getDbmCfg();
      if ((m = line.match(/^update (?:dbm|database manager) (?:cfg|configuration)\s*(.*)$/i))) return this._updDbmCfg(m[1]);
      if ((m = line.match(/^reset (?:dbm|database manager) (?:cfg|configuration)/i))) { DBM_CFG.forEach((p) => { this.inst.dbm[p[0]] = p[1]; }); return 'DB20000I  The RESET DATABASE MANAGER CONFIGURATION command completed successfully.'; }
      if ((m = line.match(/^get (?:db|database) (?:cfg|configuration)(?:\s+for\s+(\S+))?/i))) { this._needStarted(); let db; if (m[1]) db = this._findDb(m[1]); else { db = this._needConn(sess); } return this._getDbCfg(db); }
      if ((m = line.match(/^update (?:db|database) (?:cfg|configuration)\s*(.*)$/i))) { this._needStarted(); return this._updDbCfg(sess, m[1]); }
      if ((m = line.match(/^reset (?:db|database) (?:cfg|configuration)\s+for\s+(\S+)/i))) { const db = this._findDb(m[1]); DB_CFG.forEach((p) => { db.cfg[p[0]] = p[1]; }); return 'DB20000I  The RESET DATABASE CONFIGURATION command completed successfully.'; }
      if ((m = line.match(/^create (?:database|db)\s.*/i))) { this._needStarted(); return this._cmdCreateDb(sess, line.replace(/^create\s+/i, '')); }
      if ((m = line.match(/^drop (?:database|db)\s.*/i))) { this._needStarted(); return this._cmdDropDb(sess, line.replace(/^drop\s+/i, '')); }
      if (/^list (?:db|database) directory/.test(l)) return this._listDbDir();
      if (/^list active databases/.test(l)) { this._needStarted(); const act = Object.values(this.dbs).filter((d) => d.connections > 0 || d.activated); if (!act.length) return 'SQL1611W  No data was returned by Database System Monitor.  SQLSTATE=00000'; return ['', '                          Active Databases', '', ...act.map((d) => 'Database name                              = ' + d.name + '\nApplications connected currently           = ' + d.connections + '\nDatabase path                              = ' + d.path + '/db2inst1/NODE0000/SQL00001/MEMBER0000/\n')].join('\n'); }
      if ((m = line.match(/^activate (?:database|db)\s+(\S+)/i))) { this._needStarted(); const db = this._findDb(m[1]); if (db.backupPending) fail('SQL1116N', 'A connection to or activation of database "' + db.alias + '" cannot be made because of BACKUP PENDING.', '57019'); if (db.rollfwdPending) fail('SQL1117N', 'A connection to or activation of database "' + db.alias + '" cannot be made because of ROLL-FORWARD PENDING.', '57019'); db.activated = true; return 'DB20000I  The ACTIVATE DATABASE command completed successfully.'; }
      if ((m = line.match(/^deactivate (?:database|db)\s+(\S+)/i))) { this._needStarted(); const db = this._findDb(m[1]); if (db.connections > 0) fail('SQL1495W', 'Deactivate database is successful, however, there is still a connection to the database.', '01615'); db.activated = false; return 'DB20000I  The DEACTIVATE DATABASE command completed successfully.'; }
      if ((m = line.match(/^catalog (?:database|db)\s+(\S+)\s+as\s+(\S+)/i))) { const db = this._findDb(m[1]); const a = U(m[2]); if (this.aliases[a]) fail('SQL1005N', 'The database alias "' + a + '" already exists in either the local database directory or system database directory.', '51026'); this.aliases[a] = db.name; return 'DB20000I  The CATALOG DATABASE command completed successfully.\nDB21056W  Directory changes may not be effective until the directory cache is refreshed.'; }
      if ((m = line.match(/^uncatalog (?:database|db)\s+(\S+)/i))) { const a = U(m[1]); if (!this.aliases[a]) fail('SQL1019N', 'The database name "' + a + '" is not valid / not found.', '42705'); delete this.aliases[a]; return 'DB20000I  The UNCATALOG DATABASE command completed successfully.\nDB21056W  Directory changes may not be effective until the directory cache is refreshed.'; }
      if ((m = line.match(/^list applications(.*)$/i))) { this._needStarted(); return this._listApps(/show detail/i.test(m[1])); }
      if ((m = line.match(/^force application\s*(all|\(([\d,\s]+)\))/i))) { this._needStarted(); const ids = m[1].toLowerCase() === 'all' ? null : m[2].split(',').map((x) => parseInt(x, 10)); Object.values(this.sessions).forEach((s) => { if (s.db && (!ids || ids.includes(s.handle))) { this._rollback(s); this._releaseLocks(s.db, s.id); s.db.connections = Math.max(0, s.db.connections - 1); s.forced = true; } }); return 'DB20000I  The FORCE APPLICATION command completed successfully.\nDB21024I  This command is asynchronous and may not be effective immediately.'; }
      if ((m = line.match(/^list tablespaces(.*)$/i))) { return this._listTbsp(this._needConn(sess), /show detail/i.test(m[1])); }
      if ((m = line.match(/^list tablespace containers for\s+(\d+)(.*)$/i))) { return this._listCont(this._needConn(sess), parseInt(m[1], 10), /show detail/i.test(m[2])); }
      if ((m = line.match(/^list tables(?:\s+for\s+(all|schema\s+\S+))?/i))) { return this._listTables(this._needConn(sess), m[1]); }
      if ((m = line.match(/^describe\s+(?:table\s+)?(\S+)$/i)) && !/^describe\s+indexes/i.test(line)) return this._describe(this._needConn(sess), m[1]);
      if ((m = line.match(/^describe indexes for table\s+(\S+)/i))) return this._describeIdx(this._needConn(sess), m[1]);
      if (/^update monitor switches/.test(l) || /^reset monitor/.test(l)) return 'DB20000I  The UPDATE MONITOR SWITCHES command completed successfully.';
      if ((m = line.match(/^get snapshot for\s+(.*)$/i))) return this.cmdSnapshot(sess, m[1]);
      if ((m = line.match(/^update command options using\s+(\w)\s+(on|off)/i))) { if (m[1].toLowerCase() === 'c') { sess.autocommit = m[2].toLowerCase() === 'on'; return 'DB20000I  The UPDATE COMMAND OPTIONS command completed successfully.'; } return 'DB20000I  The UPDATE COMMAND OPTIONS command completed successfully.'; }
      if (/^list command options/.test(l)) return '\n     Command Line Processor Option Settings\n\n Backend process wait time (seconds)        (DB2BQTIME) = 1\n Auto-Commit                                (AUTOCOMMIT) = ' + (sess.autocommit ? 'ON' : 'OFF') + '\n';
      if (/^commit(\s+work)?$/.test(l)) { this._needConn(sess); this._commit(sess); return 'DB20000I  The SQL command completed successfully.'; }
      if (/^rollback(\s+work)?$/.test(l)) { this._needConn(sess); this._rollback(sess); return 'DB20000I  The SQL command completed successfully.'; }
      if ((m = line.match(/^change isolation to\s+(ur|cs|rs|rr)/i))) { sess.iso = U(m[1]); return 'DB21026I  For most commands, db2 must be restarted for changes to take effect (simulated: effective now).'; }
      if ((m = line.match(/^(?:backup|restore|rollforward|archive|list history|prune|recover)\b/i))) { this._needStarted(); return this.cmdRecovery(sess, line); }
      if ((m = line.match(/^(export|import|load)\s/i))) { return this.cmdDataMove(sess, line, m[1].toLowerCase()); }
      if ((m = line.match(/^(runstats|reorg|reorgchk)\b/i))) { return this.cmdMaint(sess, line, m[1].toLowerCase()); }
      if ((m = line.match(/^(start|stop|takeover)\s+hadr\b/i)) || /^takeover hadr/i.test(line)) return this.cmdHadr(sess, line);
      if (/^(explain)\s+/i.test(line)) return this.cmdExplainPlan(sess, line);
      return this._sql(sess, line);
    }

    /* ---- listings ---- */
    _listApps(detail) {
      const rows = Object.values(this.sessions).filter((s) => s.db);
      if (!rows.length) return 'SQL1611W  No data was returned by Database System Monitor.  SQLSTATE=00000';
      const out = ['', 'Auth Id  Application    Appl.      Application Id                 DB       # of', '         Name           Handle                                    Name    Agents', '-------- -------------- ---------- ------------------------------ -------- -----'];
      rows.forEach((s) => out.push(s.user.padEnd(8) + ' ' + 'db2bp'.padEnd(14) + ' ' + String(s.handle).padEnd(10) + ' ' + ('*LOCAL.db2inst1.' + (26111700 + s.id * 31)).padEnd(30) + ' ' + s.db.alias.padEnd(8) + ' 1' + (detail && s.waiting ? '   (lock-wait)' : '')));
      out.push('');
      return out.join('\n');
    }
    _tsInfo(db, ts) {
      const tabs = Object.values(db.tables).filter((t) => t.ts === ts.name);
      let used = ts.extent * (ts.id === 1 ? 0 : (ts.id === 0 ? 3000 : 1));
      tabs.forEach((t) => { const rows = this._rowCount(db, t.name); const pages = Math.max(1, Math.ceil(rows * 80 / ts.pagesize)); used += Math.ceil(pages / ts.extent) * ts.extent + ts.extent; });
      const total = ts.type === 'SMS' ? 1 : ts.containers.reduce((a, c) => a + c.pages, 0);
      if (ts.type === 'DMS' && used > total && ts.autoresize) { /* grows */ }
      const usable = ts.type === 'SMS' ? 1 : total - (total % ts.extent) - ts.extent * 0;
      return { total, usable, used: ts.type === 'SMS' ? 1 : Math.min(used, usable), pagetop: Math.min(used, usable) };
    }
    _tsContents(ts) { return ({ ANY: 'All permanent data. Regular table space.', LARGE: 'All permanent data. Large table space.', SYSTEMP: 'System Temporary data', USRTEMP: 'User Temporary data' })[ts.content]; }
    _tsStateHex(ts) { return ts.state; }
    _tsStateText(ts) { const s = []; if (ts.state & 0x20) s.push('Backup pending'); if (ts.state & 0x80) s.push('Roll forward pending'); return s.length ? s.join(', ') : 'Normal'; }
    _listTbsp(db, detail) {
      const out = ['', '           Tablespaces for Current Database', ''];
      Object.values(db.tablespaces).sort((a, b) => a.id - b.id).forEach((ts) => {
        out.push(' Tablespace ID                        = ' + ts.id, ' Name                                 = ' + ts.name,
          ' Type                                 = ' + (ts.type === 'DMS' ? 'Database managed space' : 'System managed space'),
          ' Contents                             = ' + this._tsContents(ts), ' State                                = 0x' + ts.state.toString(16).padStart(4, '0'),
          '   Detailed explanation:', '     ' + this._tsStateText(ts));
        if (detail) {
          const i = this._tsInfo(db, ts);
          out.push(' Total pages                          = ' + i.total, ' Useable pages                        = ' + (ts.type === 'SMS' ? 1 : i.usable), ' Used pages                           = ' + i.used,
            ' Free pages                           = ' + (ts.type === 'SMS' ? 'Not applicable' : (i.usable - i.used)), ' High water mark (pages)              = ' + (ts.type === 'SMS' ? 'Not applicable' : i.pagetop),
            ' Page size (bytes)                    = ' + ts.pagesize, ' Extent size (pages)                  = ' + ts.extent, ' Prefetch size (pages)                = ' + (ts.prefetch < 0 ? ts.extent : ts.prefetch),
            ' Number of containers                 = ' + ts.containers.length);
        }
        out.push('');
      });
      return out.join('\n');
    }
    _listCont(db, id, detail) {
      const ts = Object.values(db.tablespaces).find((t) => t.id === id);
      if (!ts) fail('SQL0204N', '"' + id + '" is an undefined name.', '42704');
      const out = ['', '            Tablespace Containers for Tablespace ' + id, ''];
      ts.containers.forEach((c) => { out.push(' Container ID                         = ' + c.id, ' Name                                 = ' + c.name, ' Type                                 = ' + c.type); if (detail) out.push(' Total pages                          = ' + c.pages, ' Useable pages                        = ' + (c.pages - (c.pages % ts.extent)), ' Accessible                           = Yes'); out.push(''); });
      return out.join('\n');
    }
    _listTables(db, scope) {
      const rows = Object.values(db.tables).filter((t) => !scope || /all/i.test(scope) || t.schema === U(scope.replace(/schema\s+/i, ''))).filter((t) => scope ? true : t.schema === 'DB2INST1' || true);
      const vs = Object.values(db.views).map((v) => ({ name: v.name, schema: v.schema, type: 'V', created: v.created }));
      const all = rows.map((t) => ({ name: t.name, schema: t.schema, type: 'T', created: t.created })).concat(vs).filter((t) => scope ? true : t.schema === (db.schemas[this._curSchemaOf(db)] ? this._curSchemaOf(db) : 'DB2INST1'));
      if (!all.length) return '\n  0 record(s) selected.\n';
      const out = ['', 'Table/View                      Schema          Type  Creation time', '------------------------------- --------------- ----- --------------------------'];
      all.sort((a, b) => a.name.localeCompare(b.name)).forEach((t) => out.push(t.name.padEnd(31) + ' ' + t.schema.padEnd(15) + ' ' + t.type.padEnd(5) + ' ' + tsDb2(new Date(t.created))));
      out.push('', '  ' + all.length + ' record(s) selected.', ''); return out.join('\n');
    }
    _curSchemaOf(db) { const s = Object.values(this.sessions).find((x) => x.db === db); return s ? s.schema : 'DB2INST1'; }
    _tableCols(db, name) {
      const r = db.sql.exec('PRAGMA table_info("' + name + '")');
      return r.length ? r[0].values.map((v) => ({ cid: v[0], name: U(v[1]), type: String(v[2] || 'VARCHAR'), notnull: !!v[3], pk: !!v[5] })) : [];
    }
    _typeParts(t) {
      const m = String(t).match(/^([A-Za-z ]+?)\s*(?:\((\d+)(?:\s*,\s*(\d+))?\))?$/); const base = m ? U(m[1]).trim() : U(t);
      const map = { INT: 'INTEGER', INTEGER: 'INTEGER', SMALLINT: 'SMALLINT', BIGINT: 'BIGINT', REAL: 'DOUBLE', DOUBLE: 'DOUBLE', FLOAT: 'DOUBLE', TEXT: 'VARCHAR', '': 'VARCHAR' };
      const nm = map[base] || base; const len = m && m[2] ? parseInt(m[2], 10) : ({ INTEGER: 4, SMALLINT: 2, BIGINT: 8, DOUBLE: 8, DATE: 4, TIMESTAMP: 10, TIME: 3, VARCHAR: 254, CHAR: 1, DECIMAL: 5, NUMERIC: 5, CLOB: 1048576, BLOB: 1048576, BOOLEAN: 1 })[nm] || 0;
      return { name: nm, len, scale: m && m[3] ? parseInt(m[3], 10) : 0 };
    }
    _describe(db, tn) {
      const n = this._normTable(db, tn); if (!db.tables[n] && !db.views[n]) fail('SQL0204N', '"' + n + '" is an undefined name.', '42704');
      const cols = this._tableCols(db, n); const sch = (db.tables[n] || db.views[n]).schema;
      const out = ['', '                                Column                         Type      Type', 'Name                           schema    Type name                Length   Scale Nulls', '------------------------------ --------- ------------------ ---------- ----- ------'];
      cols.forEach((c) => { const p = this._typeParts(c.type); out.push(c.name.padEnd(30) + ' ' + 'SYSIBM'.padEnd(9) + ' ' + p.name.padEnd(18) + ' ' + String(p.len).padStart(10) + ' ' + String(p.scale).padStart(5) + ' ' + (c.notnull || c.pk ? 'No' : 'Yes')); });
      out.push('', '  ' + cols.length + ' record(s) selected.', ''); return out.join('\n');
    }
    _describeIdx(db, tn) {
      const n = this._normTable(db, tn); if (!db.tables[n]) fail('SQL0204N', '"' + n + '" is an undefined name.', '42704');
      const ix = Object.values(db.indexes).filter((i) => i.table === n);
      const out = ['', '                                    Index    Index       Unique       Number of', 'Index schema          Index name                   type     rule       columns', '--------------------- ---------------------------- -------- ---------- ----------'];
      ix.forEach((i) => out.push(i.schema.padEnd(21) + ' ' + i.name.padEnd(28) + ' RELATIONAL ' + (i.unique ? 'U' : 'D') + ' ' + String(i.cols.length).padStart(10)));
      out.push('', '  ' + ix.length + ' record(s) selected.', ''); return out.join('\n');
    }
    _normTable(db, name) {
      let n = unq(name); if (n.includes('.')) n = n.split('.').pop();
      return U(n);
    }
    _rowCount(db, name) {
      try { const r = db.sql.exec('SELECT COUNT(*) FROM "' + name + '"'); return r[0].values[0][0]; } catch (e) { return 0; }
    }

    /* ---- save / load ---- */
    serialize() {
      const o = { v: 1, inst: this.inst, aliases: this.aliases, users: this.users, dirs: Array.from(this.dirs), diag: this.diag.slice(-100), dbs: {}, files: {}, sid: this.sid, lastTs: this.lastTs };
      Object.keys(this.dbs).forEach((k) => {
        const d = this.dbs[k]; if (d.txnOwner !== null) { try { d.sql.run('COMMIT'); d.txnOwner = null; } catch (e) { /* ignore */ } }
        const copy = Object.assign({}, d); const bytes = d.sql.export(); this._prep(d.sql); delete copy.sql; copy.sqlB64 = b64enc(bytes); copy.preImage = null;
        o.dbs[k] = copy;
      });
      Object.keys(this.files).forEach((k) => {
        const f = this.files[k]; if (k.startsWith('/home/db2inst1/data/') && DEL_FILES[k] === f.content) return;
        o.files[k] = f.bytes ? Object.assign({}, f, { bytes: undefined, bytesB64: b64enc(f.bytes), meta: f.meta }) : f;
      });
      return JSON.stringify(o);
    }
    load(json) {
      const o = typeof json === 'string' ? JSON.parse(json) : json;
      this.reset(); Object.assign(this.inst, o.inst); this.inst.startTime = null; this.aliases = o.aliases; this.users = o.users; this.dirs = new Set(o.dirs); this.diag = (o.diag || []).map((d) => Object.assign(d, { ts: new Date(d.ts) }));
      Object.keys(o.files).forEach((k) => { const f = o.files[k]; if (f.bytesB64) { const g = Object.assign({}, f); g.bytes = b64dec(f.bytesB64); delete g.bytesB64; this.files[k] = g; } else this.files[k] = f; });
      Object.keys(o.dbs).forEach((k) => { const c = o.dbs[k]; const db = Object.assign({}, c); db.sql = new this.SQL.Database(b64dec(c.sqlB64)); delete db.sqlB64; this._prep(db.sql); db.connections = 0; db.activated = false; db.txnOwner = null; db.locks = {}; this.dbs[k] = db; });
      this.inst.started = false; this.lastTs = o.lastTs || 0;
      return true;
    }
  }

  Db2Sim.util = { U, fail, fmtErr, p2, ts14, tsDb2, tsIso, b64enc, b64dec, splitOutside, mapOutsideStrings, unq, pageNum, DB_CFG, DBM_CFG, ROW_LIMIT, clone };
  return Db2Sim;
});
