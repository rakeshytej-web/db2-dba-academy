/* Db2 DBA Academy - simulator: SQL layer, storage (buffer pools / table spaces), security, catalog views */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else factory(root.Db2Sim);
})(typeof self !== 'undefined' ? self : this, function (Db2Sim) {
  'use strict';
  const { U, fail, p2, tsDb2, splitOutside, mapOutsideStrings, unq, pageNum, ROW_LIMIT, DB_CFG, DBM_CFG } = Db2Sim.util;
  const OK = 'DB20000I  The SQL command completed successfully.';
  const DB_PRIVS = ['CONNECT', 'CREATETAB', 'BINDADD', 'IMPLICIT_SCHEMA', 'LOAD', 'DBADM', 'SECADM', 'SQLADM', 'WLMADM', 'EXPLAIN', 'DATAACCESS', 'ACCESSCTRL', 'QUIESCE_CONNECT', 'CREATE_EXTERNAL_ROUTINE', 'CREATE_NOT_FENCED_ROUTINE'];
  const TAB_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALTER', 'INDEX', 'REFERENCES', 'CONTROL'];
  const SEC_PRIVS = ['DBADM', 'SECADM', 'ACCESSCTRL', 'DATAACCESS'];

  const P = {
    /* ================= entry ================= */
    _sql(sess, line) {
      const db = this._needConn(sess);
      const low = line.replace(/\s+/g, ' ').trim().toLowerCase();
      let m;
      if (/^create (large |regular |user temporary |system temporary )?tablespace /.test(low)) return this._createTbsp(sess, db, line);
      if (/^alter tablespace /.test(low)) return this._alterTbsp(sess, db, line);
      if (/^drop tablespace /.test(low)) return this._dropTbsp(sess, db, line);
      if (/^create bufferpool /.test(low)) return this._createBp(sess, db, line);
      if (/^alter bufferpool /.test(low)) return this._alterBp(sess, db, line);
      if (/^drop bufferpool /.test(low)) return this._dropBp(sess, db, line);
      if (/^create schema /.test(low)) return this._createSchema(sess, db, line);
      if (/^create role /.test(low)) return this._createRole(sess, db, line);
      if (/^drop role /.test(low)) { const r = U(line.split(/\s+/)[2]); if (!db.roles[r]) fail('SQL0204N', '"' + r + '" is an undefined name.', '42704'); delete db.roles[r]; return OK; }
      if (/^grant /.test(low)) return this._grant(sess, db, line);
      if (/^revoke /.test(low)) return this._revoke(sess, db, line);
      if (/^comment on /.test(low)) return OK;
      if (/^lock table /.test(low)) return this._lockTable(sess, db, line);
      if ((m = line.match(/^set\s+(?:current\s+)?schema\s*=?\s*(\S+)/i))) { sess.schema = U(unq(m[1])); return OK; }
      if ((m = line.match(/^set\s+current\s+isolation\s*=?\s*(\w+)/i))) { sess.iso = U(m[1]) === 'UNCOMMITTED' ? 'UR' : (/^(UR|CS|RS|RR)$/i.test(m[1]) ? U(m[1]) : 'CS'); return OK; }
      if (/^set\s+(current\s+)?(explain|query|degree|special)/i.test(line) || /^set\s+integrity/i.test(line)) return OK;
      if (/^create table /.test(low)) return this._createTable(sess, db, line);
      if (/^create (unique )?index /.test(low)) return this._createIndex(sess, db, line);
      if (/^create (or replace )?view /.test(low)) return this._createView(sess, db, line);
      if (/^alter table /.test(low)) return this._alterTable(sess, db, line);
      if (/^drop (table|view|index|schema) /.test(low)) return this._dropObj(sess, db, line);
      if (/^create (sequence|procedure|function|trigger|alias|nickname|server)/.test(low) && !/^create trigger/.test(low)) fail('SQL0104N', '(simulator) CREATE ' + low.split(' ')[1].toUpperCase() + ' is not supported in this training simulator. Practise it on a real Db2 instance (see docs/INSTALL).', '42601');
      return this._exec(sess, db, line);
    },

    /* ================= translation ================= */
    _translate(db, sess, sqlIn) {
      const info = { kind: sqlIn.trim().split(/\s+/)[0].toLowerCase(), tables: [], iso: null, catalog: [], writes: false };
      const schemas = new Set(Object.keys(db.schemas));
      let sql = mapOutsideStrings(sqlIn, (seg) => {
        seg = seg.replace(/\bfetch\s+first\s+(\d+)\s+rows?\s+only\b/gi, 'LIMIT $1').replace(/\bfetch\s+first\s+rows?\s+only\b/gi, 'LIMIT 1');
        seg = seg.replace(/\bwith\s+(ur|cs|rs|rr)\b/gi, (_, i) => { info.iso = U(i); return ''; });
        seg = seg.replace(/\bfor\s+(read|fetch)\s+only\b/gi, '').replace(/\boptimize\s+for\s+\d+\s+rows?\b/gi, '');
        seg = seg.replace(/\bdefault\s+current\s+(timestamp|date|time)\b/gi, 'DEFAULT CURRENT_$1');
        seg = seg.replace(/\bcurrent\s+timestamp\b/gi, 'sim_ts()').replace(/\bcurrent\s+date\b/gi, 'sim_date()').replace(/\bcurrent\s+time\b/gi, 'sim_time()');
        seg = seg.replace(/\b(?:current\s+schema|current\s+sqlid)\b/gi, "'" + sess.schema + "'").replace(/\b(?:current\s+user|session_user|system_user)\b/gi, "'" + sess.user + "'").replace(/\bcurrent\s+server\b/gi, "'" + db.alias + "'");
        seg = seg.replace(/\bsysibm\s*\.\s*sysdummy1\b/gi, () => { info.catalog.push('sysibm_sysdummy1'); return 'sysibm_sysdummy1'; });
        seg = seg.replace(/\b(syscat|sysibmadm|sysstat)\s*\.\s*(\w+)/gi, (_, a, b) => { const k = (a + '_' + b).toLowerCase(); info.catalog.push(k); return k; });
        seg = seg.replace(/\btable\s*\(\s*(\w+)\s*\(([^()]*)\)\s*\)/gi, (_, fn) => { const k = fn.toLowerCase(); info.catalog.push(k); return k; });
        seg = seg.replace(/\b(\w+)\s*\.\s*(\w+)\b/g, (all, a, b) => (schemas.has(U(a)) && !/^syscat_|^sysibm/i.test(a) ? b : all));
        return seg;
      });
      sql = sql.replace(/^\s*values\s+(?!\()/i, 'SELECT ');
      const re = /\b(?:from|join|into|update|table)\s+"?(\w+)"?/gi; let mm;
      while ((mm = re.exec(sql))) { const n = U(mm[1]); if ((db.tables[n] || db.views[n]) && !info.tables.includes(n)) info.tables.push(n); }
      const re2 = /,\s*"?(\w+)"?\s*(?:as\s+\w+|\w+)?\s*(?=,|\bwhere\b|\bgroup\b|\border\b|\blimit\b|$)/gi;
      if (/\bfrom\b/i.test(sql)) { const fromPart = sql.replace(/^[\s\S]*?\bfrom\b/i, ''); let m2; while ((m2 = re2.exec(fromPart))) { const n = U(m2[1]); if (db.tables[n] && !info.tables.includes(n)) info.tables.push(n); } }
      info.writes = /^(insert|update|delete|merge|replace)$/.test(info.kind);
      return { sql: sql.trim(), info };
    },
    _mapErr(e, sess, db, info, orig) {
      if (e && e.db2) return e;
      const msg = String((e && e.message) || e); let m;
      const mk = (c, t, s) => { const x = new Error(t); x.db2 = true; x.code = c; x.state = s; return x; };
      const sch = sess.schema;
      if ((m = msg.match(/no such table: (?:main\.)?(\S+)/))) return mk('SQL0204N', '"' + sch + '.' + U(m[1].replace(/^syscat_/i, 'SYSCAT.').replace(/_/g, '_')) + '" is an undefined name.', '42704');
      if ((m = msg.match(/no such column: (\S+)/))) return mk('SQL0206N', '"' + U(m[1].split('.').pop()) + '" is not valid in the context where it is used.', '42703');
      if (/UNIQUE constraint failed/.test(msg)) return mk('SQL0803N', 'One or more values in the INSERT statement, UPDATE statement, or foreign key update caused by a DELETE statement are not valid because the primary key, unique constraint or unique index identified by "1" constrains table "' + sch + '.' + U((msg.match(/failed: (\w+)\./) || [, 'T'])[1]) + '" from having duplicate values for the index key.', '23505');
      if ((m = msg.match(/NOT NULL constraint failed: (\w+)\.(\w+)/))) return mk('SQL0407N', 'Assignment of a NULL value to a NOT NULL column "' + U(m[2]) + '" is not allowed.', '23502');
      if (/FOREIGN KEY constraint failed/.test(msg)) return info && info.kind === 'delete' ? mk('SQL0532N', 'A parent row cannot be deleted because the relationship "SQL0001" restricts the deletion.', '23504') : mk('SQL0530N', 'The insert or update value of the FOREIGN KEY "SQL0001" is not equal to any value of the parent key of the parent table.', '23503');
      if (/CHECK constraint failed/.test(msg)) return mk('SQL0545N', 'The requested operation is not allowed because a row does not satisfy the check constraint "' + ((msg.match(/failed: (.*)$/) || [, 'CHECK'])[1]) + '".', '23513');
      if ((m = msg.match(/near "([^"]*)": syntax error/))) return mk('SQL0104N', 'An unexpected token "' + m[1] + '" was found following "' + (orig.split(m[1])[0] || '').trim().slice(-20) + '".  Expected tokens may include:  "<identifier>".', '42601');
      if (/incomplete input|unrecognized token/.test(msg)) return mk('SQL0104N', 'An unexpected token "END-OF-STATEMENT" was found following "' + orig.trim().slice(-20) + '".', '42601');
      if (/already exists/.test(msg)) return mk('SQL0601N', 'The name of the object to be created is identical to the existing name "' + sch + '.' + U((msg.match(/(?:table|index|view) (\S+) already/) || [, 'OBJ'])[1]) + '".', '42710');
      if (/datatype mismatch/.test(msg)) return mk('SQL0401N', 'The data types of the operands for the operation are not compatible.', '42818');
      if (/no such function: (\w+)/.test(msg)) return mk('SQL0440N', 'No authorized routine named "' + U(msg.match(/function: (\w+)/)[1]) + '" of type "FUNCTION" having compatible arguments was found.', '42884');
      if (/ambiguous column name: (\S+)/.test(msg)) return mk('SQL0203N', 'A reference to column "' + U(msg.match(/name: (\S+)/)[1]) + '" is ambiguous.', '42702');
      return mk('SQL0901N', 'The SQL statement failed because of a non-severe system error. Subsequent SQL statements can be processed. (Reason "' + msg + '".)', '58004');
    },

    /* ================= generic execution ================= */
    _exec(sess, db, line) {
      const t0 = Date.now();
      const { sql, info } = this._translate(db, sess, line);
      const user = sess.user;
      // authorization + table state checks
      const need = info.kind === 'select' || info.kind === 'with' || info.kind === 'values' ? 'SELECT' : info.kind === 'insert' ? 'INSERT' : info.kind === 'update' ? 'UPDATE' : info.kind === 'delete' ? 'DELETE' : null;
      info.tables.forEach((t) => {
        const obj = db.tables[t] || db.views[t];
        if (need && !this._hasTabPriv(db, user, t, need === 'SELECT' || info.kind === 'with' ? 'SELECT' : need)) fail('SQL0551N', '"' + user + '" does not have the required authorization or privilege to perform operation "' + need + '" on object "' + obj.schema + '.' + t + '".', '42501');
        if (db.tables[t]) {
          const ts = db.tablespaces[db.tables[t].ts];
          if (ts && (ts.state & 0xA0)) fail('SQL0290N', 'Table space access is not allowed. (Table space "' + ts.name + '" is in state: ' + this._tsStateText(ts) + '.)', '55039');
          if (db.tables[t].reorgPending) fail('SQL0668N', 'Operation not allowed for reason code "7" on table "' + db.tables[t].schema + '.' + t + '". (REORG-pending state - run REORG TABLE.)', '57016');
        }
      });
      if (info.catalog.length === 0 && info.kind !== 'insert' && !need && !/^(delete|update|insert|merge|create|alter|drop|call|truncate|declare|refresh)$/.test(info.kind) && info.kind !== 'explain') {
        if (!/^(select|with|values)$/.test(info.kind)) fail('SQL0104N', 'An unexpected token "' + line.split(/\s+/)[0] + '" was found. (Unsupported or unknown statement in the simulator.)', '42601');
      }
      // locks
      let snapshotRead = false;
      const dml = info.writes;
      if (info.tables.length) {
        const r = this._lockCheck(sess, db, info.tables.filter((t) => db.tables[t]), dml ? 'W' : 'R');
        if (r && r.snapshot) snapshotRead = true;
      }
      if (dml && db.txnOwner !== null && db.txnOwner !== sess.id) {
        const holder = this.sessions[db.txnOwner]; const to = parseInt(db.cfg.LOCKTIMEOUT, 10);
        db.stats.lockWaits++;
        if (to >= 0) { db.stats.lockTimeouts++; this._rollback(sess); fail('SQL0911N', 'The current transaction has been rolled back because of a deadlock or timeout.  Reason code "68".', '40001'); }
        sess.waiting = { onSid: db.txnOwner, table: info.tables[0] || '', since: Date.now() };
        fail('SQLWAIT', '[simulator] This statement is WAITING: application handle ' + (holder ? holder.handle : '?') + ' has an open write transaction (the simulator allows one writer at a time).\nCOMMIT or ROLLBACK in the other terminal, then re-run.', '');
      }
      const iso = info.iso || sess.iso;
      let tmp = [];
      let target = db.sql; let snapDb = null;
      try {
        tmp = this._materialize(db, sess, info.catalog);
        if (snapshotRead) { snapDb = new this.SQL.Database(db.preImage); this._prep(snapDb); target = snapDb; }
        let res = []; let changes = 0;
        if (dml) {
          if (!sess.autocommit) { this._beginTxnIfNeeded(sess, db); sess.txn = true; info.tables.forEach((t) => { if (db.tables[t]) db.locks[t] = { sid: sess.id, mode: 'X' }; }); }
          target.run(sql); changes = target.getRowsModified();
          db.stats.rowsModified += changes;
          info.tables.forEach((t) => { const ts = (db.tabStats[t] = db.tabStats[t] || { scans: 0, read: 0, ins: 0, upd: 0, del: 0 }); if (info.kind === 'insert') ts.ins += changes; if (info.kind === 'update') ts.upd += changes; if (info.kind === 'delete') ts.del += changes; if (db.tables[t]) { db.tables[t].churn = (db.tables[t].churn || 0) + changes; db.tables[t].cached = 0; } });
          const rec = { ts: this.now().getTime(), sql, tables: info.tables.slice(), user };
          if (sess.autocommit) { this._logRecord(db, rec); db.stats.commits++; } else sess.pending.push(rec);
          if (changes === 0 && (info.kind === 'update' || info.kind === 'delete')) return 'SQL0100W  No row was found for FETCH, UPDATE or DELETE; or the result of a query is an empty table.  SQLSTATE=02000';
          return OK;
        }
        if (/^(select|with|values)$/.test(info.kind) || info.kind === 'explain') {
          const plan = this._eqp(db, target, sql);
          res = target.exec(sql);
          const rows = res.length ? res[0].values : []; const cols = res.length ? res[0].columns : this._colNames(target, sql);
          this._account(db, sess, info, plan, rows.length, line, Date.now() - t0);
          return this._fmtResult(cols, rows, sess);
        }
        // DDL passthrough (create trigger, etc.)
        if (!sess.autocommit) { this._beginTxnIfNeeded(sess, db); sess.txn = true; }
        target.run(sql);
        const rec = { ts: this.now().getTime(), sql, tables: [], user };
        if (sess.autocommit) this._logRecord(db, rec); else sess.pending.push(rec);
        return OK;
      } catch (e) { throw this._mapErr(e, sess, db, info, line); }
      finally {
        if (snapDb) snapDb.close();
        tmp.forEach((n) => { try { db.sql.run('DROP TABLE IF EXISTS temp."' + n + '"'); } catch (e) { /* ignore */ } });
      }
    },
    _colNames(target, sql) { try { const st = target.prepare(sql); const n = st.getColumnNames(); st.free(); return n; } catch (e) { return []; } },
    _eqp(db, target, sql) {
      if (!/^\s*(select|with)/i.test(sql)) return [];
      try { const r = target.exec('EXPLAIN QUERY PLAN ' + sql); return r.length ? r[0].values.map((v) => String(v[3])) : []; } catch (e) { return []; }
    },
    _fmtVal(v) { if (v === null || v === undefined) return '-'; if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(parseFloat(v.toPrecision(15))); return String(v); },
    _fmtResult(cols, rows, sess) {
      const names = cols.map((c, i) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(c) || /^\d+$/.test(c) ? U(c) : String(i + 1)));
      const w = names.map((n, i) => Math.max(n.length, 1, ...rows.map((r) => this._fmtVal(r[i]).length)));
      const out = [''];
      if (!sess.noHdr) { out.push(names.map((n, i) => n.padEnd(w[i])).join(' ').trimEnd(), w.map((x) => '-'.repeat(x)).join(' ')); }
      rows.forEach((r) => out.push(r.map((v, i) => (typeof v === 'number' ? this._fmtVal(v).padStart(w[i]) : this._fmtVal(v).padEnd(w[i]))).join(' ').trimEnd()));
      out.push('', '  ' + rows.length + ' record(s) selected.', '');
      return out.join('\n');
    },
    _bpCap(db, bpName) { const b = db.bufferpools[bpName]; return b ? (b.size === -2 ? 250000 : b.size) : 1000; },
    _account(db, sess, info, plan, nrows, text, ms) {
      db.stats.rowsRead += nrows;
      const used = plan.some((p) => /USING (COVERING )?INDEX|USING INTEGER PRIMARY KEY/i.test(p));
      const key = text.replace(/\s+/g, ' ').trim().slice(0, 200);
      const ss = (db.stmtStats[key] = db.stmtStats[key] || { n: 0, rows: 0, ms: 0 }); ss.n++; ss.rows += nrows; ss.ms += ms;
      info.tables.forEach((t) => {
        const tb = db.tables[t]; if (!tb) return;
        const ts = db.tablespaces[tb.ts]; const bpn = ts ? ts.bp : 'IBMDEFAULTBP';
        const s = (db.bpStats[bpn] = db.bpStats[bpn] || { dl: 0, dp: 0, il: 0, ip: 0, dw: 0 });
        const card = this._rowCount(db, t); const pages = Math.max(1, Math.ceil(card * 80 / (ts ? ts.pagesize : 4096)));
        const cap = this._bpCap(db, bpn); const tsx = (db.tabStats[t] = db.tabStats[t] || { scans: 0, read: 0, ins: 0, upd: 0, del: 0 });
        if (!used) { s.dl += pages; const hit = pages <= cap ? Math.min(tb.cached || 0, pages) : 0; s.dp += pages - hit; tb.cached = pages <= cap ? pages : 0; tsx.scans++; tsx.read += card; }
        else { s.dl += 2; s.il += 3; s.ip += tb.cachedIdx ? 0 : 3; s.dp += tb.cached ? 0 : 1; tb.cachedIdx = 1; tb.cached = Math.max(tb.cached || 0, 1); tsx.read += Math.max(1, nrows); }
      });
    },
    _coldStart(db) {
      db.bpStats = {}; db.stmtStats = {}; db.tabStats = {};
      db.stats = { commits: 0, rollbacks: 0, rowsRead: 0, rowsModified: 0, lockWaits: 0, lockTimeouts: 0, deadlocks: 0 };
      Object.values(db.tables).forEach((t) => { t.cached = 0; t.cachedIdx = 0; });
    },

    /* ================= DDL: tables ================= */
    _cur(sess) { return sess.schema || 'DB2INST1'; },
    _splitName(sess, raw) {
      const parts = raw.replace(/"/g, '').split('.'); const name = U(parts.pop()); const sch = parts.length ? U(parts.pop()) : this._cur(sess);
      return { schema: sch, name };
    },
    _ensureSchema(sess, db, sch) {
      if (db.schemas[sch]) return;
      if (sess.user !== 'DB2INST1' && sch !== sess.user && !this._hasDbPriv(db, sess.user, 'IMPLICIT_SCHEMA') && !db.auth.some((a) => a.grantee === sess.user && a.priv === 'DBADM')) fail('SQL0552N', '"' + sess.user + '" does not have the privilege to perform operation "CREATE SCHEMA".', '42502');
      db.schemas[sch] = { owner: sess.user, created: this.now().getTime() };
    },
    _createTable(sess, db, line) {
      const m = line.match(/^create\s+table\s+(?:if\s+not\s+exists\s+)?((?:"?\w+"?\.)?"?\w+"?)\s*([\s\S]*)$/i);
      if (!m) fail('SQL0104N', 'An unexpected token was found in CREATE TABLE.', '42601');
      const { schema, name } = this._splitName(sess, m[1]);
      if (db.tables[name] || db.views[name]) fail('SQL0601N', 'The name of the object to be created is identical to the existing name "' + schema + '.' + name + '" of type "TABLE".', '42710');
      if (sess.user !== 'DB2INST1' && !this._hasDbPriv(db, sess.user, 'CREATETAB')) fail('SQL0552N', '"' + sess.user + '" does not have the privilege to perform operation "CREATE TABLE".', '42502');
      let rest = m[2].trim(); let tsName = null;
      const tailRe = /\)\s*((?:(?:INDEX\s+IN\s+\w+|LONG\s+IN\s+\w+|IN\s+\w+|ORGANIZE\s+BY\s+\w+|DATA\s+CAPTURE\s+\w+|COMPRESS\s+\w+|VALUE\s+COMPRESSION|NOT\s+LOGGED\s+INITIALLY|WITH\s+RESTRICT\s+ON\s+DROP)\s*)+)$/i;
      const tm = rest.match(tailRe);
      if (tm) { const inm = tm[1].replace(/INDEX\s+IN\s+\w+|LONG\s+IN\s+\w+/gi, ' ').match(/\bIN\s+(\w+)/i); if (inm) tsName = U(inm[1]); rest = rest.slice(0, rest.length - tm[0].length) + ')'; }
      let ts;
      if (tsName) { ts = db.tablespaces[tsName]; if (!ts) fail('SQL0204N', '"' + tsName + '" is an undefined name.', '42704'); if (!/ANY|LARGE/.test(ts.content)) fail('SQL0291N', 'Table "' + name + '" cannot be created in a temporary table space ("' + tsName + '").', '42838'); }
      else ts = db.tablespaces.USERSPACE1;
      let body = rest;
      let like;
      if ((like = rest.match(/^like\s+(?:"?\w+"?\.)?"?(\w+)"?/i))) body = 'AS SELECT * FROM "' + U(like[1]) + '" WHERE 0';
      else if (/^as\s*\(/i.test(rest)) { const t0 = this._translate(db, sess, rest.replace(/^as\s*\(([\s\S]*)\)\s*(with\s+(no\s+)?data)?\s*$/i, '$1')); body = 'AS ' + t0.sql + (/no\s+data/i.test(rest) ? ' LIMIT 0' : ''); }
      else {
        body = body.replace(/\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\s*(\([^)]*\))?/gi, '/*IDENT*/').replace(/\bFOR\s+BIT\s+DATA\b/gi, '').replace(/\bWITH\s+DEFAULT\b/gi, 'DEFAULT');
        body = body.replace(/("?\w+"?)\s+(INTEGER|INT|BIGINT|SMALLINT)\s+(NOT\s+NULL\s+)?\/\*IDENT\*\/(\s+PRIMARY\s+KEY)?/gi, '$1 INTEGER PRIMARY KEY AUTOINCREMENT');
        body = body.replace(/\/\*IDENT\*\//g, '');
        body = this._translate(db, sess, body).sql;
      }
      const stmt = 'CREATE TABLE "' + name + '" ' + (/^AS /i.test(body) ? body : body);
      const sqlStmt = /^AS /i.test(body) ? 'CREATE TABLE "' + name + '" ' + body : stmt;
      try {
        if (!sess.autocommit) { this._beginTxnIfNeeded(sess, db); sess.txn = true; }
        db.sql.run(sqlStmt);
      } catch (e) { throw this._mapErr(e, sess, db, { kind: 'create' }, line); }
      // row length check
      const cols = this._tableCols(db, name); let size = 0;
      cols.forEach((c) => { const p = this._typeParts(c.type); size += (/^(VARCHAR|CHAR|GRAPHIC|VARGRAPHIC)$/.test(p.name) ? p.len + (p.name === 'VARCHAR' ? 4 : 0) : /^(CLOB|BLOB|DBCLOB)$/.test(p.name) ? 68 : p.name === 'DECIMAL' || p.name === 'NUMERIC' ? Math.ceil(p.len / 2) + 1 : p.len); });
      if (size > (ROW_LIMIT[ts.pagesize] || 4005)) {
        try { db.sql.run('DROP TABLE "' + name + '"'); } catch (e) { /* ignore */ }
        fail('SQL0670N', 'The statement failed because the row length of the table exceeds the limit of "' + (ROW_LIMIT[ts.pagesize]) + '" bytes.  (Table space "' + ts.name + '".)', '54010');
      }
      this._ensureSchema(sess, db, schema);
      db.tables[name] = { name, schema, owner: sess.user, ts: ts.name, created: this.now().getTime(), stats: null, churn: 0, cached: 0 };
      const rec = { ts: this.now().getTime(), sql: sqlStmt, tables: [name], user: sess.user, meta: [{ op: 'addTable', t: Object.assign({}, db.tables[name]) }] };
      if (sess.autocommit) this._logRecord(db, rec); else sess.pending.push(rec);
      return OK;
    },
    _createIndex(sess, db, line) {
      const m = line.match(/^create\s+(unique\s+)?index\s+((?:"?\w+"?\.)?"?\w+"?)\s+on\s+((?:"?\w+"?\.)?"?\w+"?)\s*\(([^)]*)\)/i);
      if (!m) fail('SQL0104N', 'An unexpected token was found in CREATE INDEX. Expected: CREATE [UNIQUE] INDEX name ON table (col [ASC|DESC], ...)', '42601');
      const ix = this._splitName(sess, m[2]); const tn = this._normTable(db, m[3]);
      if (!db.tables[tn]) fail('SQL0204N', '"' + this._cur(sess) + '.' + tn + '" is an undefined name.', '42704');
      if (db.indexes[ix.name]) fail('SQL0601N', 'The name of the object to be created is identical to the existing name "' + ix.schema + '.' + ix.name + '" of type "INDEX".', '42710');
      if (!this._hasTabPriv(db, sess.user, tn, 'INDEX')) fail('SQL0551N', '"' + sess.user + '" does not have the required authorization or privilege to perform operation "CREATE INDEX" on object "' + db.tables[tn].schema + '.' + tn + '".', '42501');
      const colsRaw = m[4].split(',').map((s) => s.trim().replace(/\s+(asc|desc)$/i, ' $1')).filter(Boolean);
      const sqlStmt = 'CREATE ' + (m[1] ? 'UNIQUE ' : '') + 'INDEX "' + ix.name + '" ON "' + tn + '" (' + colsRaw.map((c) => c.replace(/^("?)(\w+)("?)/, '"$2"')).join(', ') + ')';
      try { if (!sess.autocommit) { this._beginTxnIfNeeded(sess, db); sess.txn = true; } db.sql.run(sqlStmt); } catch (e) { throw this._mapErr(e, sess, db, { kind: 'create' }, line); }
      db.indexes[ix.name] = { name: ix.name, schema: ix.schema, table: tn, cols: colsRaw.map((c) => U(c.split(/\s+/)[0].replace(/"/g, ''))), unique: !!m[1], created: this.now().getTime(), stats: null };
      const rec = { ts: this.now().getTime(), sql: sqlStmt, tables: [tn], user: sess.user, meta: [{ op: 'addIndex', i: Object.assign({}, db.indexes[ix.name]) }] };
      if (sess.autocommit) this._logRecord(db, rec); else sess.pending.push(rec);
      return OK;
    },
    _createView(sess, db, line) {
      const m = line.match(/^create\s+(?:or\s+replace\s+)?view\s+((?:"?\w+"?\.)?"?\w+"?)\s*(\([^)]*\))?\s+as\s+([\s\S]*)$/i);
      if (!m) fail('SQL0104N', 'An unexpected token was found in CREATE VIEW. Expected: CREATE VIEW name AS select-statement', '42601');
      const { schema, name } = this._splitName(sess, m[1]);
      if (db.tables[name] || db.views[name]) fail('SQL0601N', 'The name of the object to be created is identical to the existing name "' + schema + '.' + name + '" of type "VIEW".', '42710');
      const body = m[3].replace(/\bwith\s+(cascaded\s+|local\s+)?check\s+option\b/i, '');
      const t = this._translate(db, sess, body);
      try { if (!sess.autocommit) { this._beginTxnIfNeeded(sess, db); sess.txn = true; } db.sql.run('CREATE VIEW "' + name + '" ' + (m[2] || '') + ' AS ' + t.sql); } catch (e) { throw this._mapErr(e, sess, db, { kind: 'create' }, line); }
      this._ensureSchema(sess, db, schema);
      db.views[name] = { name, schema, owner: sess.user, text: line, created: this.now().getTime() };
      const rec = { ts: this.now().getTime(), sql: 'CREATE VIEW "' + name + '" ' + (m[2] || '') + ' AS ' + t.sql, tables: [], user: sess.user, meta: [{ op: 'addView', v: Object.assign({}, db.views[name]) }] };
      if (sess.autocommit) this._logRecord(db, rec); else sess.pending.push(rec);
      return OK;
    },
    _alterTable(sess, db, line) {
      const m = line.match(/^alter\s+table\s+((?:"?\w+"?\.)?"?\w+"?)\s+([\s\S]*)$/i);
      const tn = this._normTable(db, m[1]); const act = m[2].trim();
      if (!db.tables[tn]) fail('SQL0204N', '"' + this._cur(sess) + '.' + tn + '" is an undefined name.', '42704');
      let mm;
      const logIt = (sql, meta) => { const rec = { ts: this.now().getTime(), sql, tables: [tn], user: sess.user, meta: meta || [] }; if (sess.autocommit) this._logRecord(db, rec); else sess.pending.push(rec); };
      const run = (sql) => { try { if (!sess.autocommit) { this._beginTxnIfNeeded(sess, db); sess.txn = true; } db.sql.run(sql); } catch (e) { throw this._mapErr(e, sess, db, { kind: 'alter' }, line); } };
      if ((mm = act.match(/^add\s+(?:column\s+)?(?!primary|constraint|unique|foreign|check)(.+)$/i))) {
        const def = mm[1].replace(/\bwith\s+default\b/gi, 'DEFAULT').replace(/\bfor\s+bit\s+data\b/gi, '');
        const s = 'ALTER TABLE "' + tn + '" ADD COLUMN ' + def; run(s); logIt(s); db.tables[tn].reorgPending = db.tables[tn].reorgPending; return OK;
      }
      if ((mm = act.match(/^add\s+(?:constraint\s+(\w+)\s+)?(primary\s+key|unique)\s*\(([^)]*)\)/i))) {
        const cname = (mm[1] || 'SQL' + Date.now().toString().slice(-8)).toUpperCase(); const cols = mm[3].split(',').map((c) => '"' + c.trim().toUpperCase() + '"').join(',');
        const s = 'CREATE UNIQUE INDEX "' + cname + '" ON "' + tn + '" (' + cols + ')'; run(s);
        db.indexes[cname] = { name: cname, schema: db.tables[tn].schema, table: tn, cols: mm[3].split(',').map((c) => U(c.trim())), unique: true, pk: /primary/i.test(mm[2]), created: this.now().getTime(), stats: null };
        logIt(s, [{ op: 'addIndex', i: Object.assign({}, db.indexes[cname]) }]); return OK;
      }
      if ((mm = act.match(/^drop\s+column\s+(\w+)/i))) { const s = 'ALTER TABLE "' + tn + '" DROP COLUMN "' + mm[1].toUpperCase() + '"'; run(s); db.tables[tn].reorgPending = true; logIt(s); return OK + '\nSQL1237W  (simulator) The table is now in REORG-pending state; run REORG TABLE ' + tn + ' before further access.'; }
      if (/^(volatile|append|activate|data capture|pctfree|locksize|compress)/i.test(act)) return OK;
      fail('SQL0104N', '(simulator) This ALTER TABLE form is not supported here: ' + act.split(' ').slice(0, 3).join(' ') + ' ... Try it on a real Db2 instance.', '42601');
    },
    _dropObj(sess, db, line) {
      const m = line.match(/^drop\s+(table|view|index|schema)\s+((?:"?\w+"?\.)?"?\w+"?)/i); const kind = m[1].toLowerCase(); const nm = this._normTable(db, m[2]);
      const logIt = (sql, tables, meta) => { const rec = { ts: this.now().getTime(), sql, tables: tables || [], user: sess.user, meta: meta || [] }; if (sess.autocommit) this._logRecord(db, rec); else sess.pending.push(rec); };
      if (kind === 'schema') { if (!db.schemas[nm]) fail('SQL0204N', '"' + nm + '" is an undefined name.', '42704'); if (Object.values(db.tables).some((t) => t.schema === nm)) fail('SQL0478N', 'DROP SCHEMA cannot be processed because there is an object "' + nm + '" of type "TABLE" that depends on it.', '42893'); delete db.schemas[nm]; return OK; }
      const store = kind === 'table' ? db.tables : kind === 'view' ? db.views : db.indexes;
      if (!store[nm]) fail('SQL0204N', '"' + this._cur(sess) + '.' + nm + '" is an undefined name.', '42704');
      if (kind === 'table' && sess.user !== 'DB2INST1' && db.tables[nm].owner !== sess.user && !db.auth.some((a) => a.grantee === sess.user && a.priv === 'DBADM')) fail('SQL0551N', '"' + sess.user + '" does not have the required authorization or privilege to perform operation "DROP" on object "' + db.tables[nm].schema + '.' + nm + '".', '42501');
      if (kind === 'table' && db.locks[nm] && db.locks[nm].sid !== sess.id) this._lockCheck(sess, db, [nm], 'W');
      const sql = 'DROP ' + kind.toUpperCase() + ' "' + nm + '"';
      try { if (!sess.autocommit) { this._beginTxnIfNeeded(sess, db); sess.txn = true; } db.sql.run(sql); } catch (e) { throw this._mapErr(e, sess, db, { kind: 'drop' }, line); }
      const meta = [{ op: 'drop' + kind[0].toUpperCase() + kind.slice(1), n: nm }];
      delete store[nm];
      if (kind === 'table') { Object.keys(db.indexes).forEach((k) => { if (db.indexes[k].table === nm) delete db.indexes[k]; }); db.tabauth = db.tabauth.filter((a) => a.table !== nm); }
      logIt(sql, [nm], meta); return OK;
    },
    _syncMeta(db) {
      const present = new Set();
      try { const r = db.sql.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view','index')"); (r.length ? r[0].values : []).forEach((v) => present.add(v[1] + ':' + U(v[0]))); } catch (e) { return; }
      Object.keys(db.tables).forEach((k) => { if (!present.has('table:' + k)) delete db.tables[k]; });
      Object.keys(db.views).forEach((k) => { if (!present.has('view:' + k)) delete db.views[k]; });
      Object.keys(db.indexes).forEach((k) => { if (!present.has('index:' + k)) delete db.indexes[k]; });
    },
    _applyMeta(db, ops) {
      (ops || []).forEach((o) => {
        if (o.op === 'addTable') db.tables[o.t.name] = Object.assign({}, o.t, { cached: 0 });
        else if (o.op === 'addIndex') db.indexes[o.i.name] = Object.assign({}, o.i);
        else if (o.op === 'addView') db.views[o.v.name] = Object.assign({}, o.v);
        else if (o.op === 'dropTable') { delete db.tables[o.n]; Object.keys(db.indexes).forEach((k) => { if (db.indexes[k].table === o.n) delete db.indexes[k]; }); }
        else if (o.op === 'dropView') delete db.views[o.n]; else if (o.op === 'dropIndex') delete db.indexes[o.n];
      });
    },

    /* ================= buffer pools ================= */
    _createBp(sess, db, line) {
      const m = line.match(/^create\s+bufferpool\s+(\w+)(.*)$/i); const name = U(m[1]); const t = m[2] || '';
      if (db.bufferpools[name]) fail('SQL0601N', 'The name of the object to be created is identical to the existing name "' + name + '" of type "BUFFERPOOL".', '42710');
      if (sess.user !== 'DB2INST1' && !db.auth.some((a) => a.grantee === sess.user && (a.priv === 'DBADM'))) fail('SQL0552N', '"' + sess.user + '" does not have the privilege to perform operation "CREATE BUFFERPOOL".', '42502');
      let size = 1000; let mm;
      if ((mm = t.match(/\bsize\s+(\d+|automatic)/i))) size = /auto/i.test(mm[1]) ? -2 : parseInt(mm[1], 10);
      let ps = db.pagesize; if ((mm = t.match(/\bpagesize\s+(\d+\s*k?)/i))) { ps = pageNum(mm[1]); if (![4096, 8192, 16384, 32768].includes(ps)) fail('SQL0104N', 'PAGESIZE must be 4K, 8K, 16K or 32K.', '42601'); }
      if (size !== -2 && size < 16) fail('SQL0104N', 'SIZE must be at least 16 pages (value "' + size + '").', '42601');
      const id = Math.max(1, ...Object.values(db.bufferpools).map((b) => b.id)) + 1;
      db.bufferpools[name] = { id, size, pagesize: ps, created: this.now().getTime(), deferred: /deferred/i.test(t) };
      return OK;
    },
    _alterBp(sess, db, line) {
      const m = line.match(/^alter\s+bufferpool\s+(\w+)\s+(?:immediate\s+|deferred\s+)?size\s+(\d+|automatic)/i);
      if (!m) fail('SQL0104N', 'Expected: ALTER BUFFERPOOL name SIZE n | AUTOMATIC', '42601');
      const b = db.bufferpools[U(m[1])]; if (!b) fail('SQL0204N', '"' + U(m[1]) + '" is an undefined name.', '42704');
      b.size = /auto/i.test(m[2]) ? -2 : parseInt(m[2], 10);
      Object.values(db.tables).forEach((t) => { t.cached = 0; });
      return OK;
    },
    _dropBp(sess, db, line) {
      const name = U(line.replace(/^drop\s+bufferpool\s+/i, '').trim().split(/\s+/)[0]);
      if (!db.bufferpools[name]) fail('SQL0204N', '"' + name + '" is an undefined name.', '42704');
      if (name === 'IBMDEFAULTBP') fail('SQL0478N', 'DROP BUFFERPOOL cannot be processed because IBMDEFAULTBP is a system-required buffer pool.', '42893');
      const dep = Object.values(db.tablespaces).find((t) => t.bp === name);
      if (dep) fail('SQL0478N', 'DROP BUFFERPOOL cannot be processed because there is an object "' + dep.name + '" of type "TABLESPACE" that depends on it.', '42893');
      delete db.bufferpools[name]; return OK;
    },

    /* ================= table spaces ================= */
    _createTbsp(sess, db, line) {
      const m = line.match(/^create\s+(large\s+|regular\s+|user\s+temporary\s+|system\s+temporary\s+)?tablespace\s+(\w+)\s*(.*)$/i);
      const kind = (m[1] || '').trim().toLowerCase(); const name = U(m[2]); const t = m[3] || '';
      if (db.tablespaces[name]) fail('SQL0601N', 'The name of the object to be created is identical to the existing name "' + name + '" of type "TABLESPACE".', '42710');
      if (sess.user !== 'DB2INST1' && !db.auth.some((a) => a.grantee === sess.user && (a.priv === 'DBADM'))) fail('SQL0552N', '"' + sess.user + '" does not have the privilege to perform operation "CREATE TABLESPACE".', '42502');
      let mm;
      const content = kind === 'system temporary' ? 'SYSTEMP' : kind === 'user temporary' ? 'USRTEMP' : (kind === 'regular' ? 'ANY' : 'LARGE');
      let pagesize = db.pagesize; if ((mm = t.match(/\bpagesize\s+(\d+\s*k?)/i))) { pagesize = pageNum(mm[1]); if (![4096, 8192, 16384, 32768].includes(pagesize)) fail('SQL0104N', 'PAGESIZE must be 4K, 8K, 16K or 32K.', '42601'); }
      let bp = null; if ((mm = t.match(/\bbufferpool\s+(\w+)/i))) { bp = U(mm[1]); if (!db.bufferpools[bp]) fail('SQL0204N', '"' + bp + '" is an undefined name.', '42704'); if (db.bufferpools[bp].pagesize !== pagesize) fail('SQL0291N', 'The page size of table space "' + name + '" (' + pagesize + ') does not match the page size of buffer pool "' + bp + '" (' + db.bufferpools[bp].pagesize + ').', '428B7'); }
      else { bp = Object.keys(db.bufferpools).find((k) => db.bufferpools[k].pagesize === pagesize); if (!bp) fail('SQL0291N', 'No buffer pool with page size ' + pagesize + ' exists for table space "' + name + '". Create one first: CREATE BUFFERPOOL <name> PAGESIZE ' + (pagesize / 1024) + 'K.', '428B7'); }
      let extent = parseInt(db.cfg.DFT_EXTENT_SZ, 10) || 32; if ((mm = t.match(/\bextentsize\s+(\d+)/i))) extent = parseInt(mm[1], 10);
      if (extent < 2 || extent > 256) fail('SQL0104N', 'EXTENTSIZE must be between 2 and 256 pages.', '42601');
      let prefetch = -1; if ((mm = t.match(/\bprefetchsize\s+(\d+|automatic)/i))) prefetch = /auto/i.test(mm[1]) ? -1 : parseInt(mm[1], 10);
      let type; const containers = [];
      const base = '/home/db2inst1/db2inst1/NODE0000/' + db.name + '/T' + String(db.nextTsId).padStart(7, '0') + '/';
      let auto = false; let initial = 0; let autoresize = false; let maxsize = 'NONE'; let increase = '10 PERCENT';
      if (/managed\s+by\s+automatic\s+storage/i.test(t) || !/managed\s+by/i.test(t)) {
        if (!/managed\s+by/i.test(t) && !db.autoStorage) fail('SQL0104N', 'Database was created with AUTOMATIC STORAGE NO; specify MANAGED BY DATABASE USING (...) or SYSTEM USING (...).', '42601');
        auto = true; type = content === 'SYSTEMP' || content === 'USRTEMP' ? 'SMS' : 'DMS';
        initial = Math.floor(32 * 1024 * 1024 / pagesize); autoresize = true;
        if ((mm = t.match(/\binitialsize\s+(\d+)\s*(k|m|g)?/i))) { const u = (mm[2] || 'k').toLowerCase(); const bytes = parseInt(mm[1], 10) * (u === 'g' ? 1073741824 : u === 'm' ? 1048576 : 1024); initial = Math.floor(bytes / pagesize); }
        if ((mm = t.match(/\bmaxsize\s+(none|\d+\s*(?:k|m|g)?)/i))) maxsize = U(mm[1]).replace(/\s/g, '');
        if ((mm = t.match(/\bincreasesize\s+(\d+\s*(?:percent|k|m|g))/i))) increase = U(mm[1]);
        if ((mm = t.match(/\bautoresize\s+(yes|no)/i))) autoresize = /yes/i.test(mm[1]);
        containers.push({ id: 0, name: base + 'C0000000.' + (content === 'LARGE' ? 'LRG' : content === 'ANY' ? 'USR' : 'TMP'), type: 'File', pages: type === 'SMS' ? 1 : initial });
      } else if ((mm = t.match(/managed\s+by\s+database\s+using\s*\(([^)]*)\)(?:\s*,?\s*\(([^)]*)\))*/i))) {
        type = 'DMS';
        const re = /\(\s*(file|device)\s+'([^']+)'\s+(\d+)\s*(k|m|g)?\s*\)|(file|device)\s+'([^']+)'\s+(\d+)\s*(k|m|g)?/gi; let c; let id = 0;
        const body = t.match(/managed\s+by\s+database\s+using\s*(.*?)(?=\bextentsize\b|\bprefetchsize\b|\bbufferpool\b|\bautoresize\b|$)/i)[1];
        const re2 = /(file|device)\s+'([^']+)'\s+(\d+)\s*(k|m|g)?/gi;
        while ((c = re2.exec(body))) { let pages = parseInt(c[3], 10); const u = (c[4] || '').toLowerCase(); if (u) pages = Math.floor(pages * (u === 'g' ? 1073741824 : u === 'm' ? 1048576 : 1024) / pagesize); containers.push({ id: id++, name: c[2], type: c[1][0].toUpperCase() + c[1].slice(1).toLowerCase(), pages }); }
        if (!containers.length) fail('SQL0104N', 'Expected: MANAGED BY DATABASE USING (FILE \'path\' <pages>)', '42601');
        containers.forEach((cn) => { const dir = cn.name.replace(/\/[^/]*$/, '') || '/'; if (!this._dirExists(dir)) fail('SQL0298N', 'Bad container path: directory "' + dir + '" does not exist (create it with mkdir -p).', '428B2'); });
        initial = containers.reduce((a, c2) => a + c2.pages, 0);
      } else if ((mm = t.match(/managed\s+by\s+system\s+using\s*\(\s*'([^']+)'/i))) {
        type = 'SMS'; containers.push({ id: 0, name: mm[1], type: 'Path', pages: 1 });
        const dir = mm[1].replace(/\/[^/]*$/, '') || '/'; if (!this._dirExists(dir)) fail('SQL0298N', 'Bad container path: directory "' + dir + '" does not exist.', '428B2');
        if (content === 'LARGE') fail('SQL0104N', 'A LARGE table space cannot be SYSTEM MANAGED (use ANY/REGULAR or DATABASE MANAGED).', '42601');
      } else fail('SQL0104N', 'Unrecognised MANAGED BY clause. Use: MANAGED BY AUTOMATIC STORAGE | DATABASE USING (...) | SYSTEM USING (...)', '42601');
      db.tablespaces[name] = { id: db.nextTsId++, name, type, content, auto, pagesize, extent, prefetch, bp, containers, initial, autoresize, maxsize, increase, state: 0, created: this.now().getTime() };
      this.diagLog('Event', 'ADM6023I  Table space "' + name + '" created.');
      return OK;
    },
    _alterTbsp(sess, db, line) {
      const m = line.match(/^alter\s+tablespace\s+(\w+)\s+(.*)$/i); const ts = db.tablespaces[U(m[1])]; const t = m[2]; let mm;
      if (!ts) fail('SQL0204N', '"' + U(m[1]) + '" is an undefined name.', '42704');
      if ((mm = t.match(/^(?:add|extend)\s*\(\s*(?:all\s+containers\s+)?(?:file|device)?\s*'?([^'\s)]*)'?\s*(\d+)\s*(k|m|g)?\s*\)/i)) && ts.type === 'DMS' && !ts.auto) {
        const u = (mm[3] || '').toLowerCase(); let pages = parseInt(mm[2], 10); if (u) pages = Math.floor(pages * (u === 'g' ? 1073741824 : u === 'm' ? 1048576 : 1024) / ts.pagesize);
        if (/^extend/i.test(t)) ts.containers.forEach((c) => { c.pages += pages; }); else ts.containers.push({ id: ts.containers.length, name: mm[1], type: 'File', pages });
        return OK;
      }
      if (/^(add|extend)\s*\(/i.test(t) && ts.auto) fail('SQL0104N', 'Containers cannot be added/extended for an AUTOMATIC STORAGE table space. Use RESIZE or increase INITIALSIZE/MAXSIZE; add paths to the storage group.', '42601');
      if ((mm = t.match(/^resize\s*\(\s*all\s+(\d+)\s*(k|m|g)?\s*\)/i))) { const u = (mm[2] || '').toLowerCase(); let pages = parseInt(mm[1], 10); if (u) pages = Math.floor(pages * (u === 'g' ? 1073741824 : u === 'm' ? 1048576 : 1024) / ts.pagesize); ts.containers.forEach((c) => { c.pages = pages; }); ts.initial = pages * ts.containers.length; return OK; }
      if ((mm = t.match(/^bufferpool\s+(\w+)/i))) { const b = db.bufferpools[U(mm[1])]; if (!b) fail('SQL0204N', '"' + U(mm[1]) + '" is an undefined name.', '42704'); if (b.pagesize !== ts.pagesize) fail('SQL0291N', 'The page size of table space "' + ts.name + '" does not match the page size of buffer pool "' + b.name + '".', '428B7'); ts.bp = U(mm[1]); return OK; }
      if ((mm = t.match(/^prefetchsize\s+(\d+|automatic)/i))) { ts.prefetch = /auto/i.test(mm[1]) ? -1 : parseInt(mm[1], 10); return OK; }
      if ((mm = t.match(/^maxsize\s+(none|\d+\s*[kmg]?)/i))) { ts.maxsize = U(mm[1]).replace(/\s/g, ''); return OK; }
      if ((mm = t.match(/^autoresize\s+(yes|no)/i))) { ts.autoresize = /yes/i.test(mm[1]); return OK; }
      if ((mm = t.match(/^increasesize\s+(\d+\s*(?:percent|[kmg]))/i))) { ts.increase = U(mm[1]); return OK; }
      if (/^(overhead|transferrate|dropped table recovery|no file system caching|file system caching)/i.test(t)) return OK;
      fail('SQL0104N', '(simulator) This ALTER TABLESPACE form is not supported: ' + t.split(' ').slice(0, 3).join(' '), '42601');
    },
    _dropTbsp(sess, db, line) {
      const name = U(line.replace(/^drop\s+tablespace\s+/i, '').trim().split(/\s+/)[0]);
      const ts = db.tablespaces[name]; if (!ts) fail('SQL0204N', '"' + name + '" is an undefined name.', '42704');
      if (ts.id <= 2 && name !== 'USERSPACE1') fail('SQL0478N', 'DROP TABLESPACE cannot be processed: "' + name + '" is a system table space.', '42893');
      if (name === 'USERSPACE1') fail('SQL0478N', 'DROP TABLESPACE cannot be processed: no other table space available as default.', '42893');
      Object.values(db.tables).filter((t) => t.ts === name).forEach((t) => { try { db.sql.run('DROP TABLE "' + t.name + '"'); } catch (e) { /* ignore */ } delete db.tables[t.name]; Object.keys(db.indexes).forEach((k) => { if (db.indexes[k].table === t.name) delete db.indexes[k]; }); });
      delete db.tablespaces[name]; return OK;
    },

    /* ================= security ================= */
    _createSchema(sess, db, line) {
      const m = line.match(/^create\s+schema\s+(\w+)(?:\s+authorization\s+(\w+))?/i); const n = U(m[1]);
      if (db.schemas[n]) fail('SQL0601N', 'The name of the object to be created is identical to the existing name "' + n + '" of type "SCHEMA".', '42710');
      if (sess.user !== 'DB2INST1' && !this._hasDbPriv(db, sess.user, 'IMPLICIT_SCHEMA') && !db.auth.some((a) => a.grantee === sess.user && a.priv === 'DBADM')) fail('SQL0552N', '"' + sess.user + '" does not have the privilege to perform operation "CREATE SCHEMA".', '42502');
      db.schemas[n] = { owner: m[2] ? U(m[2]) : sess.user, created: this.now().getTime() }; return OK;
    },
    _createRole(sess, db, line) {
      const n = U(line.replace(/^create\s+role\s+/i, '').trim().split(/\s+/)[0]);
      if (sess.user !== 'DB2INST1' && !db.auth.some((a) => a.grantee === sess.user && a.priv === 'SECADM')) fail('SQL0552N', '"' + sess.user + '" does not have the privilege to perform operation "CREATE ROLE" (SECADM required).', '42502');
      if (db.roles[n]) fail('SQL0601N', 'The name of the object to be created is identical to the existing name "' + n + '" of type "ROLE".', '42710');
      db.roles[n] = { members: [], created: this.now().getTime() }; return OK;
    },
    _parseGrantees(txt) {
      return txt.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
        let m = s.match(/^(user|group|role)\s+(\S+)$/i); if (m) return { type: m[1][0].toUpperCase(), name: U(m[2]) };
        if (/^public$/i.test(s)) return { type: 'G', name: 'PUBLIC' };
        m = s.match(/^(\S+)$/); if (m) return { type: 'U', name: U(m[1]) };
        fail('SQL0104N', 'Invalid grantee "' + s + '". Use USER x, GROUP x, ROLE x or PUBLIC.', '42601');
      });
    },
    _isAdmin(db, user, priv) { return user === 'DB2INST1' || db.auth.some((a) => a.grantee === user && (a.priv === priv || (priv !== 'SECADM' && a.priv === 'DBADM'))) || (priv === 'ACCESSCTRL' && db.auth.some((a) => a.grantee === user && a.priv === 'ACCESSCTRL')); },
    _grant(sess, db, line) {
      let m = line.match(/^grant\s+(\w+)\s+to\s+(.+?)(?:\s+with\s+admin\s+option)?$/i);
      if (m && db.roles[U(m[1])] && !DB_PRIVS.includes(U(m[1]))) {
        if (!this._isAdmin(db, sess.user, 'SECADM') && !this._isAdmin(db, sess.user, 'ACCESSCTRL')) fail('SQL0551N', '"' + sess.user + '" does not have the required authorization or privilege to perform operation "GRANT" on object "' + U(m[1]) + '".', '42501');
        this._parseGrantees(m[2]).forEach((g) => { if (g.type === 'R') fail('SQL0104N', 'Role-to-role grants are not simulated.', '42601'); if (!db.roles[U(m[1])].members.includes(g.name)) db.roles[U(m[1])].members.push(g.name); }); return OK;
      }
      m = line.match(/^grant\s+(.+?)\s+on\s+(database|(?:table\s+)?(?:"?[\w.]+"?))\s+to\s+(.+?)(\s+with\s+grant\s+option)?$/i);
      if (!m) fail('SQL0104N', 'Expected: GRANT <privilege[,..]> ON DATABASE|[TABLE] <name> TO USER|GROUP|ROLE <name> | PUBLIC', '42601');
      const privs = m[1].split(',').map((s) => U(s.trim()).replace(/\s+PRIVILEGES$/, '')); const obj = m[2].trim(); const grantees = this._parseGrantees(m[3]);
      if (/^database$/i.test(obj)) {
        privs.forEach((p) => { if (!DB_PRIVS.includes(p)) fail('SQL0104N', '"' + p + '" is not a database authority/privilege. Valid: ' + DB_PRIVS.join(', '), '42601'); if (SEC_PRIVS.includes(p) ? !this._isAdmin(db, sess.user, 'SECADM') && !(p !== 'DBADM' && p !== 'SECADM' && this._isAdmin(db, sess.user, 'ACCESSCTRL')) : !this._isAdmin(db, sess.user, 'DBADM')) fail('SQL0551N', '"' + sess.user + '" does not have the required authorization or privilege to perform operation "GRANT ' + p + '" on object "' + db.alias + '".', '42501'); });
        grantees.forEach((g) => privs.forEach((p) => { if (!db.auth.some((a) => a.grantee === g.name && a.priv === p)) db.auth.push({ grantee: g.name, gtype: g.type, priv: p, grantor: sess.user }); }));
        return OK;
      }
      const tn = this._normTable(db, obj.replace(/^table\s+/i, ''));
      const o = db.tables[tn] || db.views[tn]; if (!o) fail('SQL0204N', '"' + this._cur(sess) + '.' + tn + '" is an undefined name.', '42704');
      if (!(sess.user === 'DB2INST1' || o.owner === sess.user || this._isAdmin(db, sess.user, 'ACCESSCTRL') || db.tabauth.some((a) => a.table === tn && a.grantee === sess.user && a.priv === 'CONTROL'))) fail('SQL0551N', '"' + sess.user + '" does not have the required authorization or privilege to perform operation "GRANT" on object "' + o.schema + '.' + tn + '".', '42501');
      let list = privs; if (privs.includes('ALL')) list = TAB_PRIVS.filter((x) => x !== 'CONTROL');
      list.forEach((p) => { if (!TAB_PRIVS.includes(p)) fail('SQL0104N', '"' + p + '" is not a table privilege. Valid: ' + TAB_PRIVS.join(', '), '42601'); });
      grantees.forEach((g) => list.forEach((p) => { if (!db.tabauth.some((a) => a.table === tn && a.grantee === g.name && a.priv === p)) db.tabauth.push({ table: tn, grantee: g.name, gtype: g.type, priv: p, grantor: sess.user }); }));
      return OK;
    },
    _revoke(sess, db, line) {
      let m = line.match(/^revoke\s+(\w+)\s+from\s+(.+)$/i);
      if (m && db.roles[U(m[1])] && !DB_PRIVS.includes(U(m[1]))) { this._parseGrantees(m[2]).forEach((g) => { db.roles[U(m[1])].members = db.roles[U(m[1])].members.filter((x) => x !== g.name); }); return OK; }
      m = line.match(/^revoke\s+(.+?)\s+on\s+(database|(?:table\s+)?(?:"?[\w.]+"?))\s+from\s+(.+?)(?:\s+(?:by\s+all|restrict))?$/i);
      if (!m) fail('SQL0104N', 'Expected: REVOKE <privilege[,..]> ON DATABASE|[TABLE] <name> FROM USER|GROUP|ROLE <name> | PUBLIC', '42601');
      const privs = m[1].split(',').map((s) => U(s.trim()).replace(/\s+PRIVILEGES$/, '')); const obj = m[2].trim(); const grantees = this._parseGrantees(m[3]);
      if (/^database$/i.test(obj)) {
        privs.forEach((p) => { if (SEC_PRIVS.includes(p) ? !this._isAdmin(db, sess.user, 'SECADM') : !this._isAdmin(db, sess.user, 'DBADM')) fail('SQL0551N', '"' + sess.user + '" does not have the required authorization or privilege to perform operation "REVOKE ' + p + '" on object "' + db.alias + '".', '42501'); });
        db.auth = db.auth.filter((a) => !(grantees.some((g) => g.name === a.grantee) && privs.includes(a.priv) && !(a.grantee === 'DB2INST1')));
        return OK;
      }
      const tn = this._normTable(db, obj.replace(/^table\s+/i, '')); if (!db.tables[tn] && !db.views[tn]) fail('SQL0204N', '"' + this._cur(sess) + '.' + tn + '" is an undefined name.', '42704');
      const list = privs.includes('ALL') ? TAB_PRIVS : privs;
      db.tabauth = db.tabauth.filter((a) => !(a.table === tn && grantees.some((g) => g.name === a.grantee) && list.includes(a.priv)));
      return OK;
    },
    _lockTable(sess, db, line) {
      const m = line.match(/^lock\s+table\s+((?:"?\w+"?\.)?"?\w+"?)\s+in\s+(share|exclusive)\s+mode/i);
      if (!m) fail('SQL0104N', 'Expected: LOCK TABLE name IN SHARE|EXCLUSIVE MODE', '42601');
      const tn = this._normTable(db, m[1]); if (!db.tables[tn]) fail('SQL0204N', '"' + this._cur(sess) + '.' + tn + '" is an undefined name.', '42704');
      this._lockCheck(sess, db, [tn], 'W');
      db.locks[tn] = { sid: sess.id, mode: /excl/i.test(m[2]) ? 'X' : 'S' };
      if (sess.autocommit) delete db.locks[tn]; else { this._beginTxnIfNeeded(sess, db); sess.txn = true; }
      return OK;
    },

    /* ================= catalog / monitor "views" ================= */
    _materialize(db, sess, names) {
      const created = []; const defs = this._catalogDefs(db, sess);
      Array.from(new Set(names)).forEach((n) => {
        const d = defs[n]; if (!d) fail('SQL0204N', '"' + n.replace('_', '.').toUpperCase() + '" is an undefined name.', '42704');
        db.sql.run('DROP TABLE IF EXISTS temp."' + n + '"');
        db.sql.run('CREATE TEMP TABLE "' + n + '" (' + d.cols.map((c) => '"' + c + '"').join(',') + ')');
        const rows = d.rows(); if (rows.length) { const st = db.sql.prepare('INSERT INTO temp."' + n + '" VALUES (' + d.cols.map(() => '?').join(',') + ')'); rows.forEach((r) => st.run(r)); st.free(); }
        created.push(n);
      });
      return created;
    },
    _catalogDefs(db, sess) {
      const self = this; const T = (t) => tsDb2(new Date(t)); const yn = (b) => (b ? 'Y' : 'N');
      const tsList = () => Object.values(db.tablespaces);
      const bpOf = (n) => db.bufferpools[n] || { id: 0 };
      const D = {};
      D.sysibm_sysdummy1 = { cols: ['IBMREQD'], rows: () => [['Y']] };
      D.syscat_tables = {
        cols: ['TABSCHEMA', 'TABNAME', 'OWNER', 'OWNERTYPE', 'TYPE', 'STATUS', 'CREATE_TIME', 'STATS_TIME', 'COLCOUNT', 'CARD', 'NPAGES', 'FPAGES', 'TBSPACEID', 'TBSPACE', 'KEYCOLUMNS'],
        rows: () => Object.values(db.tables).map((t) => { const ts = db.tablespaces[t.ts]; const st = t.stats; const cols = self._tableCols(db, t.name); const ix = Object.values(db.indexes).find((i) => i.table === t.name && i.pk); return [t.schema, t.name, t.owner, 'U', 'T', 'N', T(t.created), st ? T(st.at) : null, cols.length, st ? st.card : -1, st ? st.pages : -1, st ? st.pages : -1, ts ? ts.id : 2, t.ts, ix ? ix.cols.length : 0]; })
          .concat(Object.values(db.views).map((v) => [v.schema, v.name, v.owner, 'U', 'V', 'N', T(v.created), null, 0, -1, -1, -1, null, null, 0]))
          .concat(['TABLES', 'COLUMNS', 'INDEXES', 'TABLESPACES', 'BUFFERPOOLS', 'SCHEMATA', 'DBAUTH', 'TABAUTH'].map((n) => ['SYSCAT', n, 'SYSIBM', 'S', 'V', 'N', T(db.created), null, 0, -1, -1, -1, null, null, 0]))
      };
      D.syscat_columns = {
        cols: ['TABSCHEMA', 'TABNAME', 'COLNAME', 'COLNO', 'TYPENAME', 'LENGTH', 'SCALE', 'NULLS', 'KEYSEQ'],
        rows: () => { const r = []; Object.values(db.tables).forEach((t) => self._tableCols(db, t.name).forEach((c, i) => { const p = self._typeParts(c.type); r.push([t.schema, t.name, c.name, i, p.name, p.len, p.scale, yn(!(c.notnull || c.pk)), c.pk ? 1 : null]); })); return r; }
      };
      D.syscat_indexes = {
        cols: ['INDSCHEMA', 'INDNAME', 'TABSCHEMA', 'TABNAME', 'COLNAMES', 'UNIQUERULE', 'COLCOUNT', 'INDEXTYPE', 'CREATE_TIME', 'STATS_TIME', 'NLEAF', 'NLEVELS', 'FULLKEYCARD'],
        rows: () => Object.values(db.indexes).map((i) => { const t = db.tables[i.table]; const st = i.stats; return [i.schema, i.name, t ? t.schema : 'DB2INST1', i.table, i.cols.map((c) => '+' + c).join(''), i.pk ? 'P' : i.unique ? 'U' : 'D', i.cols.length, 'REG', T(i.created), st ? T(st.at) : null, st ? st.nleaf : -1, st ? 2 : -1, st ? st.card : -1]; })
      };
      D.syscat_tablespaces = {
        cols: ['TBSPACE', 'TBSPACEID', 'OWNER', 'TBSPACETYPE', 'DATATYPE', 'EXTENTSIZE', 'PREFETCHSIZE', 'PAGESIZE', 'BUFFERPOOLID', 'BUFFERPOOL', 'SGNAME', 'CREATE_TIME', 'DROP_RECOVERY'],
        rows: () => tsList().map((t) => [t.name, t.id, 'SYSIBM', t.type === 'DMS' ? 'D' : 'S', ({ ANY: 'A', LARGE: 'L', SYSTEMP: 'T', USRTEMP: 'U' })[t.content], t.extent, t.prefetch, t.pagesize, bpOf(t.bp).id, t.bp, t.auto ? 'IBMSTOGROUP' : null, T(t.created), t.content === 'ANY' || t.content === 'LARGE' ? 'Y' : 'N'])
      };
      D.syscat_bufferpools = { cols: ['BPNAME', 'BUFFERPOOLID', 'NGNAME', 'NPAGES', 'PAGESIZE', 'ESTORE', 'NUMBLOCKPAGES', 'BLOCKSIZE'], rows: () => Object.keys(db.bufferpools).map((n) => { const b = db.bufferpools[n]; return [n, b.id, null, b.size, b.pagesize, 'N', 0, 0]; }) };
      D.syscat_schemata = { cols: ['SCHEMANAME', 'OWNER', 'OWNERTYPE', 'CREATE_TIME'], rows: () => Object.keys(db.schemas).map((n) => [n, db.schemas[n].owner, 'U', T(db.schemas[n].created)]) };
      D.syscat_dbauth = {
        cols: ['GRANTOR', 'GRANTORTYPE', 'GRANTEE', 'GRANTEETYPE', 'DBADMAUTH', 'CREATETABAUTH', 'BINDADDAUTH', 'CONNECTAUTH', 'IMPLSCHEMAAUTH', 'SECURITYADMAUTH', 'DATAACCESSAUTH', 'ACCESSCTRLAUTH', 'LOADAUTH', 'EXPLAINAUTH', 'SQLADMAUTH'],
        rows: () => { const g = {}; db.auth.forEach((a) => { (g[a.grantee] = g[a.grantee] || { type: a.gtype, p: new Set() }).p.add(a.priv); }); return Object.keys(g).map((k) => { const p = g[k].p; return ['SYSIBM', 'S', k, g[k].type, yn(p.has('DBADM')), yn(p.has('CREATETAB')), yn(p.has('BINDADD')), yn(p.has('CONNECT')), yn(p.has('IMPLICIT_SCHEMA')), yn(p.has('SECADM')), yn(p.has('DATAACCESS')), yn(p.has('ACCESSCTRL')), yn(p.has('LOAD')), yn(p.has('EXPLAIN')), yn(p.has('SQLADM'))]; }); }
      };
      D.syscat_tabauth = {
        cols: ['GRANTOR', 'GRANTEE', 'GRANTEETYPE', 'TABSCHEMA', 'TABNAME', 'CONTROLAUTH', 'ALTERAUTH', 'DELETEAUTH', 'INDEXAUTH', 'INSERTAUTH', 'REFAUTH', 'SELECTAUTH', 'UPDATEAUTH'],
        rows: () => { const g = {}; db.tabauth.forEach((a) => { const k = a.grantee + '|' + a.table; (g[k] = g[k] || { a, p: new Set() }).p.add(a.priv); }); return Object.keys(g).map((k) => { const x = g[k]; const p = x.p; const t = db.tables[x.a.table] || db.views[x.a.table]; return [x.a.grantor, x.a.grantee, x.a.gtype, t ? t.schema : 'DB2INST1', x.a.table, yn(p.has('CONTROL')), yn(p.has('ALTER')), yn(p.has('DELETE')), yn(p.has('INDEX')), yn(p.has('INSERT')), yn(p.has('REFERENCES')), yn(p.has('SELECT')), yn(p.has('UPDATE'))]; }); }
      };
      D.syscat_roles = { cols: ['ROLENAME', 'ROLEID', 'CREATE_TIME'], rows: () => Object.keys(db.roles).map((r, i) => [r, 1000 + i, T(db.roles[r].created)]) };
      D.syscat_roleauth = { cols: ['GRANTOR', 'GRANTEE', 'GRANTEETYPE', 'ROLENAME'], rows: () => { const r = []; Object.keys(db.roles).forEach((n) => db.roles[n].members.forEach((m) => r.push(['DB2INST1', m, 'U', n]))); return r; } };
      D.syscat_views = { cols: ['VIEWSCHEMA', 'VIEWNAME', 'OWNER', 'TEXT'], rows: () => Object.values(db.views).map((v) => [v.schema, v.name, v.owner, v.text]) };
      D.sysibmadm_dbcfg = { cols: ['NAME', 'VALUE', 'VALUE_FLAGS', 'DEFERRED_VALUE', 'DEFERRED_VALUE_FLAGS', 'DBPARTITIONNUM'], rows: () => DB_CFG.map((p) => [p[0].toLowerCase(), db.cfg[p[0]], 'NONE', db.cfg[p[0]], 'NONE', 0]) };
      D.sysibmadm_dbmcfg = { cols: ['NAME', 'VALUE', 'VALUE_FLAGS', 'DEFERRED_VALUE', 'DEFERRED_VALUE_FLAGS', 'DBPARTITIONNUM'], rows: () => DBM_CFG.map((p) => [p[0].toLowerCase(), self.inst.dbm[p[0]], 'NONE', self.inst.dbm[p[0]], 'NONE', 0]) };
      D.sysibmadm_env_inst_info = { cols: ['INST_NAME', 'IS_INST_PARTITIONABLE', 'NUM_DBPARTITIONS', 'INST_PTR_SIZE', 'RELEASE_NUM', 'SERVICE_LEVEL', 'BLD_LEVEL', 'PTF', 'FIXPACK_NUM'], rows: () => [['db2inst1', 0, 1, 64, '12.01.0000', 'DB2 v12.1.0.0', 's2411221234', 'DYN2411221234AMD64', 0]] };
      const bpRows = () => Object.keys(db.bufferpools).map((n) => { const s = db.bpStats[n] || { dl: 0, dp: 0, il: 0, ip: 0, dw: 0 }; return { n, s }; });
      D.mon_get_bufferpool = { cols: ['BP_NAME', 'MEMBER', 'POOL_DATA_L_READS', 'POOL_DATA_P_READS', 'POOL_INDEX_L_READS', 'POOL_INDEX_P_READS', 'POOL_DATA_WRITES', 'POOL_TEMP_DATA_L_READS', 'DIRECT_READS'], rows: () => bpRows().map((x) => [x.n, 0, x.s.dl, x.s.dp, x.s.il, x.s.ip, x.s.dw, 0, 0]) };
      D.sysibmadm_bp_hitratio = {
        cols: ['BP_NAME', 'TOTAL_HIT_RATIO_PERCENT', 'DATA_HIT_RATIO_PERCENT', 'INDEX_HIT_RATIO_PERCENT', 'XDA_HIT_RATIO_PERCENT'],
        rows: () => bpRows().map((x) => { const r = (l, p) => (l > 0 ? Math.round((1 - p / l) * 10000) / 100 : null); return [x.n, r(x.s.dl + x.s.il, x.s.dp + x.s.ip), r(x.s.dl, x.s.dp), r(x.s.il, x.s.ip), null]; })
      };
      D.mon_get_tablespace = {
        cols: ['TBSP_NAME', 'TBSP_ID', 'TBSP_TYPE', 'TBSP_CONTENT_TYPE', 'TBSP_PAGE_SIZE', 'TBSP_EXTENT_SIZE', 'TBSP_PREFETCH_SIZE', 'TBSP_TOTAL_PAGES', 'TBSP_USABLE_PAGES', 'TBSP_USED_PAGES', 'TBSP_FREE_PAGES', 'TBSP_PAGE_TOP', 'TBSP_STATE', 'POOL_DATA_L_READS', 'POOL_DATA_P_READS'],
        rows: () => tsList().map((t) => { const i = self._tsInfo(db, t); return [t.name, t.id, t.type === 'DMS' ? 'DMS' : 'SMS', ({ ANY: 'ANY', LARGE: 'LARGE', SYSTEMP: 'SYSTEMP', USRTEMP: 'USRTEMP' })[t.content], t.pagesize, t.extent, t.prefetch < 0 ? t.extent : t.prefetch, i.total, i.usable, i.used, t.type === 'DMS' ? i.usable - i.used : 0, i.pagetop, self._tsStateText(t).toUpperCase().replace(/ /g, '_'), 0, 0]; })
      };
      D.sysibmadm_tbsp_utilization = {
        cols: ['TBSP_NAME', 'TBSP_ID', 'TBSP_TYPE', 'TBSP_CONTENT_TYPE', 'TBSP_STATE', 'TBSP_TOTAL_SIZE_KB', 'TBSP_USED_SIZE_KB', 'TBSP_FREE_SIZE_KB', 'TBSP_UTILIZATION_PERCENT', 'TBSP_PAGE_SIZE', 'TBSP_EXTENT_SIZE'],
        rows: () => tsList().map((t) => { const i = self._tsInfo(db, t); const k = t.pagesize / 1024; return [t.name, t.id, t.type, t.content, self._tsStateText(t).toUpperCase(), i.total * k, i.used * k, (i.usable - i.used) * k, i.usable ? Math.round(i.used / i.usable * 10000) / 100 : null, t.pagesize, t.extent]; })
      };
      D.mon_get_connection = { cols: ['APPLICATION_HANDLE', 'APPLICATION_NAME', 'APPLICATION_ID', 'SESSION_AUTH_ID', 'CLIENT_HOSTNAME', 'CLIENT_PID', 'TOTAL_APP_COMMITS', 'ROWS_READ'], rows: () => Object.values(self.sessions).filter((s) => s.db === db).map((s) => [s.handle, 'db2bp', '*LOCAL.db2inst1.' + (26111700 + s.id * 31), s.user, 'db2server', 4200 + s.id, db.stats.commits, db.stats.rowsRead]) };
      D.mon_get_database = { cols: ['DB_NAME', 'TOTAL_APP_COMMITS', 'TOTAL_APP_ROLLBACKS', 'ROWS_READ', 'ROWS_MODIFIED', 'LOCK_WAITS', 'LOCK_TIMEOUTS', 'DEADLOCKS', 'APPLS_CUR_CONS'], rows: () => [[db.alias, db.stats.commits, db.stats.rollbacks, db.stats.rowsRead, db.stats.rowsModified, db.stats.lockWaits, db.stats.lockTimeouts, db.stats.deadlocks, db.connections]] };
      D.mon_get_table = { cols: ['TABSCHEMA', 'TABNAME', 'TABLE_SCANS', 'ROWS_READ', 'ROWS_INSERTED', 'ROWS_UPDATED', 'ROWS_DELETED'], rows: () => Object.values(db.tables).map((t) => { const s = db.tabStats[t.name] || { scans: 0, read: 0, ins: 0, upd: 0, del: 0 }; return [t.schema, t.name, s.scans, s.read, s.ins, s.upd, s.del]; }) };
      D.mon_get_pkg_cache_stmt = { cols: ['STMT_TEXT', 'NUM_EXECUTIONS', 'TOTAL_ACT_TIME', 'ROWS_READ', 'ROWS_RETURNED', 'EXECUTABLE_ID'], rows: () => Object.keys(db.stmtStats).map((k, i) => { const s = db.stmtStats[k]; return [k, s.n, s.ms, s.rows, s.rows, 'x' + (1000 + i)]; }) };
      D.mon_get_locks = { cols: ['LOCK_NAME', 'LOCK_OBJECT_TYPE', 'LOCK_MODE', 'LOCK_STATUS', 'HLD_APPLICATION_HANDLE', 'TABSCHEMA', 'TABNAME'], rows: () => Object.keys(db.locks).map((t, i) => [('0000000' + (1000 + i)).slice(-8) + '0000000000000000540054', 'TABLE_LOCK', db.locks[t].mode, 'G', (self.sessions[db.locks[t].sid] || {}).handle, db.tables[t] ? db.tables[t].schema : 'DB2INST1', t]) };
      D.sysibmadm_mon_lockwaits = { cols: ['REQ_APPLICATION_HANDLE', 'HLD_APPLICATION_HANDLE', 'TABSCHEMA', 'TABNAME', 'LOCK_MODE_REQUESTED', 'LOCK_WAIT_ELAPSED_TIME'], rows: () => Object.values(self.sessions).filter((s) => s.waiting && s.db === db).map((s) => [s.handle, (self.sessions[s.waiting.onSid] || {}).handle, 'DB2INST1', s.waiting.table, 'S', Math.round((Date.now() - s.waiting.since) / 1000)]) };
      const tabInfo = () => Object.values(db.tables).map((t) => { const rows = self._rowCount(db, t.name); const ts = db.tablespaces[t.ts]; const kb = Math.max(ts ? ts.pagesize / 1024 : 4, Math.ceil(rows * 80 / 1024) + (t.churn > rows ? Math.ceil(t.churn * 80 / 1024) : 0)); return [t.schema, t.name, 'T', kb, Math.max(4, Math.ceil(rows * 20 / 1024)), t.reorgPending ? 'Y' : 'N', t.churn > Math.max(10, rows * 0.3) ? 'Y' : 'N']; });
      D.admin_get_tab_info = { cols: ['TABSCHEMA', 'TABNAME', 'TABTYPE', 'DATA_OBJECT_P_SIZE', 'INDEX_OBJECT_P_SIZE', 'REORG_PENDING', 'RECLAIMABLE_SPACE_ENABLED'], rows: tabInfo };
      D.sysibmadm_admintabinfo = D.admin_get_tab_info;
      return D;
    }
  };
  Object.assign(Db2Sim.prototype, P);
});
