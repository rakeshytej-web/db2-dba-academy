/* Db2 DBA Academy - simulator: backup/recovery, data movement, maintenance, HADR, monitoring, explain, utilities */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else factory(root.Db2Sim);
})(typeof self !== 'undefined' ? self : this, function (Db2Sim) {
  'use strict';
  const { U, fail, p2, ts14, tsDb2, tsIso, unq, splitOutside, clone } = Db2Sim.util;
  const OK = 'DB20000I  The SQL command completed successfully.';
  const META_KEYS = ['tables', 'indexes', 'views', 'schemas', 'roles', 'auth', 'tabauth', 'bufferpools', 'tablespaces', 'cfg', 'nextTsId', 'pagesize'];
  const fmtStamp = (d) => p2(d.getMonth() + 1) + '/' + p2(d.getDate()) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + '.' + '123456';

  function parseDel(line, coldel) {
    const out = []; let cur = ''; let q = false; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') { q = true; quoted = true; }
      else if (c === coldel) { out.push({ v: cur, quoted }); cur = ''; quoted = false; }
      else cur += c;
    }
    out.push({ v: cur, quoted });
    return out.map((f) => (f.v === '' && !f.quoted ? null : (f.quoted ? f.v : (/^[-+]?\d+(\.\d+)?$/.test(f.v.trim()) ? Number(f.v) : f.v))));
  }
  const delEncode = (v, coldel) => (v === null || v === undefined ? '' : typeof v === 'number' ? String(v) : '"' + String(v).replace(/"/g, '""') + '"');

  const A = {
    /* ================= backup / restore / rollforward ================= */
    cmdRecovery(sess, line) {
      const l = line.replace(/\s+/g, ' ').trim();
      if (/^backup (database|db)\b/i.test(l)) return this._backup(sess, l);
      if (/^restore (database|db)\b/i.test(l)) return this._restore(sess, l);
      if (/^rollforward (database|db)\b/i.test(l)) return this._rollforward(sess, l);
      if (/^archive log for (database|db)\b/i.test(l)) {
        const db = this._findDb(l.split(' ')[4]);
        if (!this._archiving(db)) fail('SQL1766N', 'The command cannot be executed: database "' + db.alias + '" is not configured for archive logging (LOGARCHMETH1 = OFF).', '57019');
        this._rollLog(db); return 'DB20000I  The ARCHIVE LOG command completed successfully.';
      }
      if (/^list history\b/i.test(l)) return this._listHistory(l);
      fail('SQL0104N', '(simulator) This recovery command form is not supported: ' + l.split(' ').slice(0, 3).join(' '), '42601');
    },
    _imageName(db, stamp, tbsp) { return db.alias + '.' + (tbsp ? 3 : 0) + '.db2inst1.DBPART000.' + stamp + '.001'; },
    _metaOf(db) { const o = {}; META_KEYS.forEach((k) => { o[k] = clone(db[k]); }); return o; },
    _backup(sess, l) {
      const m = l.match(/^backup\s+(?:database|db)\s+(\S+)(.*)$/i); const db = this._findDb(m[1]); const tail = m[2] || '';
      const online = /\bonline\b/i.test(tail); const incr = /\bincremental\b/i.test(tail); const delta = /\bdelta\b/i.test(tail);
      const tsm = tail.match(/tablespace\s*\(([^)]*)\)/i); const tsList = tsm ? tsm[1].split(',').map((s) => U(s.trim())) : null;
      const to = tail.match(/\bto\s+(\/\S*)/i); const dir = (to ? to[1] : '/home/db2inst1').replace(/\/+$/, '') || '/';
      if (!this._dirExists(dir)) fail('SQL2036N', 'The path for the file or device "' + dir + '" is not valid.', '428A1');
      if (tsList) tsList.forEach((t) => { if (!db.tablespaces[t]) fail('SQL2315N', 'The table space "' + t + '" does not exist (BACKUP).', '42704'); });
      if (online && !this._archiving(db)) fail('SQL2413N', 'Online backup is not allowed because either logretain or userexit for roll-forward is not activated, or a backup pending condition exists for the database.', '55028');
      if (tsList && !this._archiving(db)) fail('SQL2413N', 'Table space backup requires archive logging (LOGARCHMETH1 must not be OFF) - not allowed here.', '55028');
      if (!online && (db.connections > 0 || db.activated)) fail('SQL1035N', 'The database is currently in use.', '57019');
      if (incr) {
        if (db.cfg.TRACKMOD !== 'YES') fail('SQL2426N', 'The database has not been configured to allow the incremental backup operation. Reason code = "1".', '57003');
        if (!db.trackFull) fail('SQL2426N', 'The database has not been configured to allow the incremental backup operation. Reason code = "2" (take a full backup after enabling TRACKMOD).', '57003');
      }
      const when = this.uniqueTs(); const stamp = ts14(when);
      let bytes;
      if (db.txnOwner !== null && db.preImage) bytes = db.preImage; else { bytes = db.sql.export(); this._prep(db.sql); }
      if (online && this._archiving(db)) this._rollLog(db);
      this.logStore = this.logStore || {}; this.logStore[db.name] = db.logs;
      const name = this._imageName(db, stamp, !!tsList); const path = dir + '/' + name;
      this.files[path] = { type: 'backup', db: db.name, alias: db.alias, stamp, tsMs: when.getTime(), online, incremental: incr, delta, tablespaces: tsList, bytes: new Uint8Array(bytes), meta: this._metaOf(db), logIndex: db.logs.length, archived: this._archiving(db), size: bytes.length };
      const tsNames = tsList || Object.keys(db.tablespaces).filter((t) => db.tablespaces[t].content !== 'SYSTEMP');
      db.hist.push({ op: 'B', obj: tsList ? 'T' : 'D', stamp, type: incr ? (online ? (delta ? 'E' : 'O') : (delta ? 'D' : 'I')) : (online ? 'N' : 'F'), early: this._logName(Math.max(0, db.logSeq - 1)), cur: this._logName(db.logSeq), comment: 'DB2 BACKUP ' + db.alias + ' ' + (online ? 'ONLINE' : 'OFFLINE'), loc: path, tbsp: tsNames });
      if (!tsList) { db.backupPending = false; if (db.cfg.TRACKMOD === 'YES') db.trackFull = true; db.lastFullBackup = when.getTime(); }
      else tsList.forEach((t) => { db.tablespaces[t].state &= ~0x20; });
      this.diagLog('Event', 'ADM1700I  Backup of database "' + db.alias + '" completed, image ' + name);
      return '\nBackup successful. The timestamp for this backup image is : ' + stamp + '\n';
    },
    _findImage(path, alias, taken) {
      const dir = path.replace(/\/+$/, '') || '/'; const pre = dir === '/' ? '/' : dir + '/';
      const c = Object.keys(this.files).filter((k) => k.startsWith(pre) && this.files[k].type === 'backup' && U(this.files[k].alias) === U(alias) && (!taken || this.files[k].stamp === taken)).map((k) => this.files[k]);
      c.sort((a, b) => b.tsMs - a.tsMs); return c[0] || null;
    },
    _restore(sess, l) {
      const m = l.match(/^restore\s+(?:database|db)\s+(\S+)(.*)$/i); const alias = U(m[1]); const tail = m[2] || '';
      const from = tail.match(/\bfrom\s+(\/\S*)/i); const dir = from ? from[1] : '/home/db2inst1';
      if (!this._dirExists(dir.replace(/\/+$/, '') || '/')) fail('SQL2036N', 'The path for the file or device "' + dir + '" is not valid.', '428A1');
      const taken = (tail.match(/\btaken\s+at\s+(\d+)/i) || [])[1]; const into = (tail.match(/\binto\s+(\w+)/i) || [])[1];
      const noRf = /without\s+rolling\s+forward/i.test(tail); const tsm = tail.match(/tablespace\s*\(([^)]*)\)/i);
      const img = this._findImage(dir, alias, taken);
      if (!img) fail('SQL2062N', 'An error occurred while accessing media "' + dir + '". Reason code: "2" (no backup image found for database "' + alias + '"' + (taken ? ' taken at ' + taken : '') + ').', '57019');
      const target = U(into || alias);
      const existing = this.aliases[target] ? this.dbs[this.aliases[target]] : null;
      if (tsm) {
        if (!existing) fail('SQL2565N', 'Database "' + target + '" does not exist; a table space restore needs an existing database.', '57019');
        if (!/online/i.test(tail) && (existing.connections > 0 || existing.activated)) fail('SQL1035N', 'The database is currently in use.', '57019');
        const names = tsm[1].split(',').map((s) => U(s.trim()));
        return this._restoreTbsp(existing, img, names);
      }
      if (existing && (existing.connections > 0 || existing.activated)) fail('SQL1035N', 'The database is currently in use.', '57019');
      if (into && existing) fail('SQL2542N', 'No match for a database image file was found based on the source database alias "' + alias + '" and timestamp "' + img.stamp + '" provided (target database "' + target + '" already exists).', '2E000');
      if (img.online && noRf) fail('SQL2537N', 'Roll-forward is required following the Restore of an online backup image.', '57019');
      const meta = clone(img.meta);
      let db = existing; let warn = '';
      if (existing) warn = 'SQL2539W  Restoring to an existing database that is the same as the backup image database. The database files will be deleted.\n';
      else { db = this._makeDb(target, {}); this.dbs[target] = db; this.aliases[target] = target; }
      Object.assign(db, meta); db.name = target; db.alias = target;
      try { db.sql.close(); } catch (e) { /* ignore */ }
      db.sql = new this.SQL.Database(new Uint8Array(img.bytes)); this._prep(db.sql);
      this.logStore = this.logStore || {};
      db.logs = into ? (this.logStore[img.db] || []).slice() : (this.logStore[img.db] || db.logs || []);
      this.logStore[target] = db.logs; db.rfStart = img.logIndex; db.locks = {}; db.txnOwner = null; db.preImage = null; db.backupPending = false;
      db.rollfwdPending = !!img.archived && !noRf; db.trackFull = false;
      if (noRf && img.archived) { db.logs.length = Math.min(db.logs.length, img.logIndex); }
      this._coldStart(db);
      db.hist.push({ op: 'R', obj: 'D', stamp: ts14(this.uniqueTs()), type: 'F', early: '', cur: '', comment: 'RESTORE ' + img.alias + (noRf ? ' WITHOUT ROLLING FORWARD' : ''), loc: dir, tbsp: [] });
      this.diagLog('Event', 'ADM1701I  Restore of database "' + target + '" completed.');
      return warn + 'DB20000I  The RESTORE DATABASE command completed successfully.';
    },
    _restoreTbsp(db, img, names) {
      names.forEach((n) => { if (!db.tablespaces[n]) fail('SQL2315N', 'The table space "' + n + '" does not exist.', '42704'); });
      const src = new this.SQL.Database(new Uint8Array(img.bytes)); let count = 0;
      Object.values(img.meta.tables).filter((t) => names.includes(t.ts)).forEach((t) => {
        const ddl = src.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='" + t.name + "'");
        if (!ddl.length) return;
        try { db.sql.run('DROP TABLE IF EXISTS "' + t.name + '"'); } catch (e) { /* ignore */ }
        db.sql.run(ddl[0].values[0][0]);
        const data = src.exec('SELECT * FROM "' + t.name + '"');
        if (data.length) { const st = db.sql.prepare('INSERT INTO "' + t.name + '" VALUES (' + data[0].columns.map(() => '?').join(',') + ')'); data[0].values.forEach((r) => st.run(r)); st.free(); }
        const ix = src.exec("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='" + t.name + "' AND sql IS NOT NULL"); if (ix.length) ix[0].values.forEach((v) => { try { db.sql.run(v[0]); } catch (e) { /* ignore */ } });
        db.tables[t.name] = Object.assign({}, t, { cached: 0 }); Object.keys(img.meta.indexes).forEach((k) => { if (img.meta.indexes[k].table === t.name) db.indexes[k] = Object.assign({}, img.meta.indexes[k]); });
        count++;
      });
      src.close();
      names.forEach((n) => { db.tablespaces[n].state |= 0x80; db.tablespaces[n].state &= ~0x20; });
      db.rfStart = img.logIndex; db.rfTbsp = names;
      db.hist.push({ op: 'R', obj: 'T', stamp: ts14(this.uniqueTs()), type: 'F', early: '', cur: '', comment: 'RESTORE ' + db.alias + ' TABLESPACE', loc: '', tbsp: names });
      return 'DB20000I  The RESTORE DATABASE command completed successfully.';
    },
    _parseStamp(s, utc) {
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})\.(\d{2})\.(\d{2})/); if (!m) return null;
      return utc ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    },
    _rollforward(sess, l) {
      const m = l.match(/^rollforward\s+(?:database|db)\s+(\S+)(.*)$/i); const db = this._findDb(m[1]); const t = m[2] || '';
      const tsm = t.match(/tablespace\s*\(([^)]*)\)/i); const names = tsm ? tsm[1].split(',').map((s) => U(s.trim())) : null;
      const status = (state, first, last, lastTx) => ['', '                                 Rollforward Status', '', ' Input database alias                   = ' + db.alias, ' Number of members have returned status = 1', '', ' Member ID                              = 0', ' Rollforward status                     = ' + state, ' Next log file to be read               = ' + (state === 'not pending' ? '' : first), ' Log files processed                    = ' + (last ? first + ' - ' + last : '-'), ' Last committed transaction             = ' + (lastTx ? tsDb2(new Date(lastTx)).replace(/\.\d+$/, '.000000') + ' Local' : '2026-01-01-00.00.00.000000 Local'), '', 'DB20000I  The ROLLFORWARD command completed successfully.'].join('\n');
      if (/query\s+status/i.test(t)) return status(db.rollfwdPending || (db.rfTbsp && db.rfTbsp.length) ? 'DB  working' : 'not pending', this._logName(Math.floor((db.rfStart || 0) / 5)), '', null);
      const tsPending = Object.values(db.tablespaces).filter((x) => x.state & 0x80).map((x) => x.name);
      if (!db.rollfwdPending && !(names && names.some((n) => tsPending.includes(n))) && !/\bstop\b|\bcomplete\b|cancel/i.test(t)) fail('SQL1273N', 'The database "' + db.alias + '" is not in roll-forward pending state (nothing to roll forward).', '57019');
      if (db.rollfwdPending === false && !tsPending.length && /\bstop\b|\bcomplete\b/i.test(t) && !/\bto\b/i.test(t)) fail('SQL1273N', 'The database "' + db.alias + '" is not in roll-forward pending state.', '57019');
      if (db.connections > 0 && !names) fail('SQL1035N', 'The database is currently in use.', '57019');
      let stopMs = Infinity; const tm = t.match(/\bto\s+(\d{4}-\d{2}-\d{2}-\d{2}\.\d{2}\.\d{2}(?:\.\d+)?)(?:\s+using\s+(local|utc)\s+time)?/i);
      if (tm) { stopMs = this._parseStamp(tm[1], /utc/i.test(tm[2] || '')); if (stopMs !== null) stopMs += 999; if (stopMs === null) fail('SQL0104N', 'Invalid timestamp "' + tm[1] + '". Format: YYYY-MM-DD-HH.MM.SS', '42601'); }
      const stop = /\b(and\s+)?(stop|complete)\b/i.test(t) || /\bstop\b/i.test(t);
      if (/\bcancel\b/i.test(t)) { return 'DB20000I  The ROLLFORWARD command completed successfully.'; }
      const start = db.rfStart || 0;
      let recs = db.logs.slice(start).filter((r) => r.ts <= stopMs);
      if (names) { const tabs = new Set(Object.values(db.tables).filter((x) => names.includes(x.ts)).map((x) => x.name)); recs = recs.filter((r) => r.tables && r.tables.length && r.tables.every((x) => tabs.has(x))); }
      let last = null; let n = 0;
      recs.forEach((r) => {
        try { if (r.stmts) r.stmts.forEach((s) => db.sql.run(s[0], s[1])); else if (r.sql) db.sql.run(r.sql); this._applyMeta(db, r.meta); last = r.ts; n++; } catch (e) { /* skip */ }
      });
      const firstLog = this._logName(Math.floor(start / 5)); const lastLog = this._logName(Math.floor((start + Math.max(0, recs.length - 1)) / 5));
      if (stop || /\bend\s+of\s+logs\b/i.test(t) && /(stop|complete)/i.test(t)) {
        if (names) { names.forEach((x) => { db.tablespaces[x].state &= ~0x80; }); db.rfTbsp = []; }
        else { db.rollfwdPending = false; if (stopMs !== Infinity) db.logs.length = start + recs.length; db.rfTbsp = []; }
        db.hist.push({ op: 'F', obj: names ? 'T' : 'D', stamp: ts14(this.uniqueTs()), type: 'E', early: firstLog, cur: lastLog, comment: 'ROLLFORWARD ' + db.alias + (stopMs === Infinity ? ' END OF LOGS' : ' POINT-IN-TIME'), loc: '', tbsp: names || [] });
        this.diagLog('Event', 'ADM1702I  Rollforward of database "' + db.alias + '" completed.');
        return status('not pending', firstLog, recs.length ? lastLog : '', last);
      }
      return status('DB  working', firstLog, recs.length ? lastLog : '', last);
    },
    _listHistory(l) {
      const m = l.match(/^list history\s+(backup|rollforward|restore|load|all)?\s*(?:all|since\s+\S+|containing\s+\S+)?\s*for\s+(?:database\s+|db\s+)?(\S+)/i);
      if (!m) fail('SQL0104N', 'Expected: LIST HISTORY BACKUP|ROLLFORWARD|RESTORE|LOAD|ALL ALL FOR <db>', '42601');
      const db = this._findDb(m[2]); const kind = (m[1] || 'all').toLowerCase(); const opMap = { backup: 'B', rollforward: 'F', restore: 'R', load: 'L' };
      const rows = db.hist.filter((h) => kind === 'all' || h.op === opMap[kind]);
      const out = ['', '                    List History File for ' + db.alias, '', 'Number of matching file entries = ' + rows.length, ''];
      if (!rows.length) return out.join('\n');
      out.push(' Op Obj Timestamp+Sequence Type Dev Earliest Log Current Log  Backup ID', ' -- --- ------------------ ---- --- ------------ ------------ --------------');
      rows.forEach((h, i) => {
        out.push('  ' + h.op + '  ' + h.obj + '  ' + (h.stamp + '001').padEnd(18) + '   ' + (h.type || '').padEnd(3) + '  D  ' + (h.early || '').padEnd(12) + ' ' + (h.cur || '').padEnd(12), '----------------------------------------------------------------------------');
        if (h.tbsp && h.tbsp.length) { out.push('  Contains ' + h.tbsp.length + ' tablespace(s):', ''); h.tbsp.forEach((t, j) => out.push(' ' + String(j + 1).padStart(5, '0') + ' ' + t)); out.push('----------------------------------------------------------------------------'); }
        out.push('    Comment: ' + h.comment, ' Start Time: ' + h.stamp, '   End Time: ' + h.stamp, '     Status: A', '----------------------------------------------------------------------------', '  EID: ' + (i + 1) + ' Location: ' + (h.loc || ''), '');
      });
      return out.join('\n');
    },
    cmdCkbkp(line) {
      const args = line.replace(/^db2ckbkp\s*/i, '').trim().split(/\s+/); const file = args.filter((a) => !a.startsWith('-')).pop();
      const f = file && this.files[file]; if (!f || f.type !== 'backup') return file ? 'ERROR: cannot open "' + file + '" (is it a backup image? use ls to find it).' : 'Usage: db2ckbkp [-h] <backup image file>';
      if (args.includes('-h')) return ['=====================', 'MEDIA HEADER REACHED:', '=====================', '        Server Database Name           -- ' + f.db, '        Server Database Alias          -- ' + f.alias, '        Client Database Alias          -- ' + f.alias, '        Timestamp                      -- ' + f.stamp, '        Database Partition Number      -- 0', '        Instance                       -- db2inst1', '        Sequence Number                -- 1', '        Release ID                     -- F00 (Db2 12.1)', '        Backup Mode                    -- ' + (f.online ? '1 (Online)' : '0 (Offline)'), '        Backup Type                    -- ' + (f.tablespaces ? '3 (Table space)' : f.incremental ? '1 (Incremental)' : '0 (Full database)'), '        Includes Logs                  -- 0', '        Compression                    -- 0', '        Roll forward pending after restore -- ' + (f.archived ? 'YES (archive logging was enabled)' : 'NO')].join('\n');
      return '[1] Buffers processed:  ' + '#'.repeat(Math.max(3, Math.ceil(f.size / 50000))) + '\nImage Verification Complete - successful.';
    },

    /* ================= data movement ================= */
    _selectRows(sess, db, sqlIn) {
      const { sql, info } = this._translate(db, sess, sqlIn);
      info.tables.forEach((t) => { if (!this._hasTabPriv(db, sess.user, t, 'SELECT')) fail('SQL0551N', '"' + sess.user + '" does not have the required authorization or privilege to perform operation "SELECT" on object "' + (db.tables[t] || db.views[t]).schema + '.' + t + '".', '42501'); });
      const tmp = this._materialize(db, sess, info.catalog);
      try { const r = db.sql.exec(sql); return r.length ? r[0] : { columns: this._colNames(db.sql, sql), values: [] }; } catch (e) { throw this._mapErr(e, sess, db, info, sqlIn); } finally { tmp.forEach((n) => { try { db.sql.run('DROP TABLE IF EXISTS temp."' + n + '"'); } catch (e) { /* ignore */ } }); }
    },
    cmdDataMove(sess, line, kind) {
      const db = this._needConn(sess); const l = line.replace(/\s+/g, ' ').trim();
      const fm = l.match(/^(?:export\s+to|import\s+from|load\s+from)\s+(\S+)\s+of\s+(del|ixf|asc)\b/i);
      if (!fm) fail('SQL0104N', 'Expected: ' + kind.toUpperCase() + ' ' + (kind === 'export' ? 'TO' : 'FROM') + ' <file> OF DEL|IXF ...', '42601');
      const file = fm[1]; const fmt = fm[2].toLowerCase(); let coldel = ',';
      const cd = l.match(/modified\s+by\s+(.*?)(?=\s+(?:messages|commitcount|insert|replace|restart|terminate|select|with|values|create|copy|nonrecoverable|into)\b|$)/i);
      if (cd) { const c = cd[1].match(/coldel(\S)/i); if (c) coldel = c[1]; }
      const mm = l.match(/\bmessages\s+(\S+)/i); const msgFile = mm ? mm[1] : null;
      const hdr = (path) => { const d = path.replace(/\/[^/]*$/, '') || '/'; if (!this._dirExists(d)) fail('SQL3001C', 'An I/O error (reason = "path ' + d + ' does not exist") occurred while opening the file "' + path + '".', '58030'); };
      if (kind === 'export') {
        hdr(file);
        const sel = l.match(/\b(select|values|with)\b[\s\S]*$/i); if (!sel) fail('SQL0104N', 'EXPORT needs a SELECT statement.', '42601');
        const r = this._selectRows(sess, db, sel[0]);
        if (fmt === 'ixf') this.files[file] = { type: 'text', content: 'IXF\n' + JSON.stringify({ cols: r.columns, rows: r.values }), ixf: true };
        else this.files[file] = { type: 'text', content: r.values.map((row) => row.map((v) => (coldel !== ',' ? delEncode(v) : delEncode(v))).join(coldel)).join('\n') + (r.values.length ? '\n' : '') };
        if (msgFile) { hdr(msgFile); this.files[msgFile] = { type: 'text', content: 'SQL3104N  The Export utility is beginning to export data to file "' + file + '".\nSQL3105N  The Export utility has finished exporting "' + r.values.length + '" rows.\n' }; }
        return '\nNumber of rows exported: ' + r.values.length + '\n\nDB20000I  The EXPORT command completed successfully.';
      }
      // import / load
      const f = this.files[file]; if (!f || f.type !== 'text') fail('SQL3001C', 'An I/O error (reason = "No such file") occurred while opening the file "' + file + '".', '58030');
      const im = l.match(/\b(insert_update|insert|replace_create|replace|create|restart|terminate)\s+into\s+((?:"?\w+"?\.)?"?\w+"?)\s*(\(([^)]*)\))?/i);
      if (!im) fail('SQL0104N', 'Expected: ... INSERT|REPLACE|INSERT_UPDATE INTO <table> [(columns)]', '42601');
      const mode = im[1].toLowerCase(); const tn = this._normTable(db, im[2]);
      if (!db.tables[tn]) fail('SQL0204N', '"' + this._cur(sess) + '.' + tn + '" is an undefined name.', '42704');
      const tb = db.tables[tn]; const ts = db.tablespaces[tb.ts];
      if (kind === 'load') { if (sess.user !== 'DB2INST1' && !(this._hasDbPriv(db, sess.user, 'LOAD'))) fail('SQL0552N', '"' + sess.user + '" does not have the privilege to perform operation "LOAD".', '42502'); }
      if (!this._hasTabPriv(db, sess.user, tn, 'INSERT')) fail('SQL0551N', '"' + sess.user + '" does not have the required authorization or privilege to perform operation "INSERT" on object "' + tb.schema + '.' + tn + '".', '42501');
      if (ts && (ts.state & 0xA0)) fail('SQL0290N', 'Table space access is not allowed. (Table space "' + ts.name + '" is in state: ' + this._tsStateText(ts) + '.)', '55039');
      if (db.locks[tn] && db.locks[tn].sid !== sess.id) this._lockCheck(sess, db, [tn], 'W');
      let rows;
      if (f.ixf) { const o = JSON.parse(f.content.replace(/^IXF\n/, '')); rows = o.rows; } else rows = f.content.split('\n').filter((x) => x.length).map((x) => parseDel(x, coldel));
      const tcols = this._tableCols(db, tn).map((c) => c.name); const cols = im[4] ? im[4].split(',').map((c) => U(c.trim())) : tcols;
      cols.forEach((c) => { if (!tcols.includes(c)) fail('SQL0206N', '"' + c + '" is not valid in the context where it is used.', '42703'); });
      const t0 = this.now().getTime(); let ins = 0; let upd = 0; let rej = 0; const msgs = [];
      const stmts = []; const verb = mode === 'insert_update' ? 'INSERT OR REPLACE' : 'INSERT';
      const sqlIns = verb + ' INTO "' + tn + '" (' + cols.map((c) => '"' + c + '"').join(',') + ') VALUES (' + cols.map(() => '?').join(',') + ')';
      if (db.txnOwner !== null && db.txnOwner !== sess.id) fail('SQL0911N', 'The current transaction has been rolled back because of a deadlock or timeout.  Reason code "68".', '40001');
      const inTxn = db.txnOwner === sess.id;
      try {
        if (!inTxn) db.sql.run('BEGIN');
        if (mode === 'replace' || mode === 'replace_create') { db.sql.run('DELETE FROM "' + tn + '"'); stmts.push(['DELETE FROM "' + tn + '"', []]); }
        const st = db.sql.prepare(sqlIns);
        rows.forEach((r, i) => {
          if (r.length !== cols.length) { rej++; if (msgs.length < 5) msgs.push('SQL3125W  The character data in row "' + (i + 1) + '" and column "' + r.length + '" was truncated / wrong number of columns.'); return; }
          try { st.run(r); ins++; stmts.push([sqlIns, r]); } catch (e) { rej++; if (msgs.length < 5) msgs.push('SQL3306N  An SQL error "' + (this._mapErr(e, sess, db, { kind: 'insert' }, '').code) + '" occurred while inserting a row into the table (row ' + (i + 1) + ').'); }
        });
        st.free();
        if (!inTxn) db.sql.run('COMMIT');
      } catch (e) { if (!inTxn) { try { db.sql.run('ROLLBACK'); } catch (x) { /* ignore */ } } throw this._mapErr(e, sess, db, { kind: 'insert' }, line); }
      tb.churn = (tb.churn || 0) + ins; tb.cached = 0; db.stats.rowsModified += ins;
      const rec = { ts: t0, tables: [tn], stmts, user: sess.user };
      let extra = '';
      if (kind === 'import') { this._logRecord(db, rec); db.stats.commits++; }
      else {
        const copyYes = /copy\s+yes/i.test(l); const nonrec = /nonrecoverable/i.test(l);
        if (copyYes) { this._logRecord(db, rec); if (/copy\s+yes\s+to\s+(\/\S+)/i.test(l)) { const cp = l.match(/copy\s+yes\s+to\s+(\/\S+)/i)[1]; this._mkdirs(cp); this.files[cp.replace(/\/+$/, '') + '/' + db.alias + '.4.db2inst1.DBPART000.' + ts14(this.uniqueTs()) + '.001'] = { type: 'text', content: '(load copy image)' }; } }
        else if (this._archiving(db) && !nonrec) { ts.state |= 0x20; extra = '\nSQL1477W  (simulator) For table "' + tb.schema + '.' + tn + '" the table space "' + ts.name + '" is now in BACKUP PENDING state: the LOAD was not logged and no COPY YES was given. Back up the table space (BACKUP DATABASE ... TABLESPACE (' + ts.name + ')) to clear it.'; }
        else if (nonrec) { tb.nonrecoverable = true; }
        db.hist.push({ op: 'L', obj: 'T', stamp: ts14(this.uniqueTs()), type: 'R', early: '', cur: '', comment: 'LOAD ' + tb.schema + '.' + tn + ' ' + mode.toUpperCase(), loc: file, tbsp: [tb.ts] });
      }
      if (msgFile) { hdr(msgFile); this.files[msgFile] = { type: 'text', content: msgs.join('\n') + '\n' }; }
      const stamp = fmtStamp(this.now());
      if (kind === 'import') return ['', 'SQL3109N  The utility is beginning to load data from file "' + file + '".', '', 'SQL3110N  The utility has completed processing.  "' + rows.length + '" rows were read from the input file.', '', 'SQL3221W  ...Begin COMMIT WORK. Input Record Count = "' + rows.length + '".', '', 'SQL3222W  ...COMMIT of any database changes was successful.', '', 'SQL3149N  "' + rows.length + '" rows were processed from the input file.  "' + ins + '" rows were successfully inserted into the table.  "' + rej + '" rows were rejected.', ...msgs, '', '', 'Number of rows read         = ' + rows.length, 'Number of rows skipped      = 0', 'Number of rows inserted     = ' + (mode === 'insert_update' ? ins : ins), 'Number of rows updated      = ' + upd, 'Number of rows rejected     = ' + rej, 'Number of rows committed    = ' + rows.length, ''].join('\n');
      return ['', 'SQL3109N  The utility is beginning to load data from file "' + file + '".', '', 'SQL3500W  The utility is beginning the "LOAD" phase at time "' + stamp + '".', '', 'SQL3110N  The utility has completed processing.  "' + rows.length + '" rows were read from the input file.', '', 'SQL3515W  The utility has finished the "LOAD" phase at time "' + stamp + '".', '', 'SQL3500W  The utility is beginning the "BUILD" phase at time "' + stamp + '".', '', 'SQL3213I  The indexing mode is "REBUILD".', '', 'SQL3515W  The utility has finished the "BUILD" phase at time "' + stamp + '".', ...msgs, '', '', 'Number of rows read         = ' + rows.length, 'Number of rows skipped      = 0', 'Number of rows loaded       = ' + ins, 'Number of rows rejected     = ' + rej, 'Number of rows deleted      = 0', 'Number of rows committed    = ' + rows.length, extra, ''].join('\n');
    },

    /* ================= RUNSTATS / REORG / REORGCHK ================= */
    cmdMaint(sess, line, kind) {
      const db = this._needConn(sess); const l = line.replace(/\s+/g, ' ').trim();
      const tm = l.match(/(?:on\s+table|for\s+table)\s+((?:"?\w+"?\.)?"?\w+"?)/i);
      const needOwner = (tn) => { const t = db.tables[tn]; if (!t) fail('SQL0204N', '"' + this._cur(sess) + '.' + tn + '" is an undefined name.', '42704'); if (!(sess.user === 'DB2INST1' || t.owner === sess.user || db.auth.some((a) => a.grantee === sess.user && (a.priv === 'DBADM' || a.priv === 'SQLADM')) || db.tabauth.some((a) => a.table === tn && a.grantee === sess.user && a.priv === 'CONTROL'))) fail('SQL0551N', '"' + sess.user + '" does not have the required authorization or privilege to perform operation "' + kind.toUpperCase() + '" on object "' + t.schema + '.' + tn + '".', '42501'); return t; };
      if (kind === 'runstats') {
        if (!tm) fail('SQL0104N', 'Expected: RUNSTATS ON TABLE <schema.table> [WITH DISTRIBUTION] [AND INDEXES ALL]', '42601');
        const tn = this._normTable(db, tm[1]); const t = needOwner(tn); const card = this._rowCount(db, tn); const ts = db.tablespaces[t.ts];
        const pages = Math.max(1, Math.ceil(card * 80 / (ts ? ts.pagesize : 4096)));
        t.stats = { at: this.now().getTime(), card, pages };
        Object.values(db.indexes).filter((i) => i.table === tn).forEach((i) => { i.stats = { at: this.now().getTime(), card, nleaf: Math.max(1, Math.ceil(card / 200)) }; });
        return 'DB20000I  The RUNSTATS command completed successfully.';
      }
      if (kind === 'reorg') {
        if (/^reorg\s+indexes\s+all\s+for\s+table/i.test(l) || /^reorg\s+table/i.test(l)) {
          const tn = this._normTable(db, (l.match(/table\s+((?:"?\w+"?\.)?"?\w+"?)/i) || [])[1] || ''); const t = needOwner(tn);
          if (/^reorg\s+table/i.test(l)) { t.churn = 0; t.reorgPending = false; t.cached = 0; }
          return 'DB20000I  The REORG command completed successfully.' + (/inplace/i.test(l) ? '\nDB21024I  This command is asynchronous and may not be effective immediately.' : '');
        }
        fail('SQL0104N', 'Expected: REORG TABLE <name> | REORG INDEXES ALL FOR TABLE <name>', '42601');
      }
      // reorgchk
      const upd = /update\s+statistics/i.test(l);
      let names;
      if (/on\s+table\s+all/i.test(l) || /on\s+schema/i.test(l) || /on\s+table\s+user/i.test(l)) names = Object.keys(db.tables); else if (tm) names = [this._normTable(db, tm[1])]; else fail('SQL0104N', 'Expected: REORGCHK UPDATE|CURRENT STATISTICS ON TABLE ALL|<name>', '42601');
      names.forEach((n) => needOwner(n));
      if (upd) names.forEach((n) => { const t = db.tables[n]; const card = this._rowCount(db, n); const ts = db.tablespaces[t.ts]; t.stats = { at: this.now().getTime(), card, pages: Math.max(1, Math.ceil(card * 80 / (ts ? ts.pagesize : 4096))) }; Object.values(db.indexes).filter((i) => i.table === n).forEach((i) => { i.stats = { at: this.now().getTime(), card, nleaf: Math.max(1, Math.ceil(card / 200)) }; }); });
      const out = ['', upd ? 'Doing RUNSTATS ....' : 'Table statistics (using current statistics):', '', '', 'Table statistics:', '', 'F1: 100 * OVERFLOW / CARD < 5', 'F2: 100 * (Effective Space Utilization of Data Pages) > 70', 'F3: 100 * (Required Pages / Total Pages) > 80', '', 'SCHEMA.NAME                     CARD     OV     NP     FP ACTBLK    TSIZE  F1  F2  F3 REORG', '----------------------------------------------------------------------------------------'];
      names.forEach((n) => {
        const t = db.tables[n]; const card = t.stats ? t.stats.card : this._rowCount(db, n); const ts = db.tablespaces[t.ts]; const np = Math.max(1, Math.ceil(card * 80 / (ts ? ts.pagesize : 4096))); const dead = t.churn > card * 0.3 ? t.churn : 0;
        const fp = np + Math.ceil(dead * 80 / (ts ? ts.pagesize : 4096)); const f2 = Math.round(100 * card * 80 / (fp * (ts ? ts.pagesize : 4096))); const f3 = Math.round(100 * np / fp); const ov = 0;
        const flag = (f2 > 70 || f2 === 0 && !dead ? '-' : '*') + '-' + (f3 > 80 ? '-' : '*'); const fl = (ov / Math.max(card, 1) * 100 < 5 ? '-' : '*') + (f2 > 70 ? '-' : '*') + (f3 > 80 ? '-' : '*');
        out.push('Table: ' + t.schema + '.' + n, ' '.repeat(26) + String(card).padStart(6) + String(ov).padStart(7) + String(np).padStart(7) + String(fp).padStart(7) + '      -' + String(card * 80).padStart(9) + ' ' + String(0).padStart(3) + String(Math.min(100, f2)).padStart(4) + String(Math.min(100, f3)).padStart(4) + ' ' + fl, '----------------------------------------------------------------------------------------');
      });
      out.push('', 'Index statistics:', '', 'F4: CLUSTERRATIO or normalized CLUSTERFACTOR > 80', 'F5: 100 * (Space used on leaf pages / Space available on non-empty leaf pages) > MIN(50, (100 - PCTFREE))', 'F6: (100 - PCTFREE) * (Amount of space available in an index with one less level / Amount of space required for all keys) < 100', 'F7: 100 * (Number of pseudo-deleted RIDs / Number of RIDs) < 20', 'F8: 100 * (Number of pseudo-empty leaf pages / Number of leaf pages) < 20', '', 'SCHEMA.NAME                  INDCARD  LEAF ELEAF LVLS  NDEL    KEYS LEAF_RECSIZE NLEAF_RECSIZE LEAF_PAGE_OVERHEAD NLEAF_PAGE_OVERHEAD  PCT_PAGES_SAVED  F4  F5  F6  F7  F8 REORG', '--------------------------------------------------------------------------------------------------------------------------------------------------------------------');
      Object.values(db.indexes).filter((i) => names.includes(i.table)).forEach((i) => { const card = this._rowCount(db, i.table); out.push('Table: ' + (db.tables[i.table] || {}).schema + '.' + i.table, 'Index: ' + i.schema + '.' + i.name, ' '.repeat(29) + String(card).padStart(7) + String(Math.max(1, Math.ceil(card / 200))).padStart(6) + '     0    1     0' + String(card).padStart(8) + '           8             8                 94                  94                0  100  99   0   0   0 -----'); });
      out.push('--------------------------------------------------------------------------------------------------------------------------------------------------------------------', '', 'CLUSTERRATIO or normalized CLUSTERFACTOR (F4) will indicate REORG is necessary', 'for indexes that are not in the same sequence as the base table. When multiple', 'indexes are defined on a table, one or more indexes may be flagged as needing', 'REORG.  Specify the most important index for REORG sequencing.', '');
      return out.join('\n');
    },

    /* ================= HADR ================= */
    _hadrRole(db, sess) { return db.hadr ? (db.hadr.primaryHost === sess.host ? 'PRIMARY' : 'STANDBY') : 'STANDARD'; },
    cmdHadr(sess, line) {
      const l = line.replace(/\s+/g, ' ').trim(); let m;
      if ((m = l.match(/^start hadr on (?:database|db) (\S+) as (primary|standby)(?: by force)?/i))) {
        this._needStarted(); const db = this._findDb(m[1]);
        if (m[2].toLowerCase() === 'standby') return 'SQL1767N  (simulator) Start HADR as STANDBY must be run on the standby server. This simulator provides the standby for you: configure the PRIMARY and run "start hadr on database ' + db.alias + ' as primary".';
        if (db.hadr) fail('SQL1768N', 'Unable to start HADR. Reason code = "7" (HADR is already started).', '55019');
        const c = db.cfg; const need = ['HADR_LOCAL_HOST', 'HADR_LOCAL_SVC', 'HADR_REMOTE_HOST', 'HADR_REMOTE_SVC', 'HADR_REMOTE_INST'].filter((k) => !c[k]);
        if (need.length) fail('SQL1767N', 'Start HADR cannot complete. Reason code = "1" (not configured: ' + need.join(', ') + ').', '57019');
        if (!this._archiving(db)) fail('SQL1767N', 'Start HADR cannot complete. Reason code = "2" (database must use archive logging: set LOGARCHMETH1).', '57019');
        if (db.backupPending || db.rollfwdPending) fail('SQL1767N', 'Start HADR cannot complete. Reason code = "3" (database is in backup / rollforward pending state).', '57019');
        if (!db.lastFullBackup) fail('SQL1767N', 'Start HADR cannot complete. Reason code = "4" (no backup exists: the standby must be restored from a backup of the primary).', '57019');
        db.hadr = { primaryHost: 'primary', state: 'PEER', sync: c.HADR_SYNCMODE, local: c.HADR_LOCAL_HOST + ':' + c.HADR_LOCAL_SVC, remote: c.HADR_REMOTE_HOST + ':' + c.HADR_REMOTE_SVC, since: this.now().getTime(), connected: true };
        this.diagLog('Event', 'ADM12500I  HADR started on database "' + db.alias + '" as primary.');
        return 'DB20000I  The START HADR ON DATABASE command completed successfully.';
      }
      if ((m = l.match(/^stop hadr on (?:database|db) (\S+)/i))) { const db = this._findDb(m[1]); if (!db.hadr) fail('SQL1767N', 'Stop HADR cannot complete. Reason code = "1" (HADR is not started).', '57019'); db.hadr = null; return 'DB20000I  The STOP HADR ON DATABASE command completed successfully.'; }
      if ((m = l.match(/^takeover hadr on (?:database|db) (\S+)(?: (by force))?/i))) {
        const db = this._findDb(m[1]); if (!db.hadr) fail('SQL1770N', 'Takeover HADR cannot complete. Reason code = "1" (HADR is not started).', '57019');
        if (this._hadrRole(db, sess) === 'PRIMARY') fail('SQL1770N', 'Takeover HADR cannot complete. Reason code = "1" (this database is already the HADR primary - run TAKEOVER on the standby).', '57019');
        db.hadr.primaryHost = sess.host; db.hadr.since = this.now().getTime();
        this.diagLog('Event', 'ADM12503I  HADR takeover completed on database "' + db.alias + '".');
        return 'DB20000I  The TAKEOVER HADR ON DATABASE command completed successfully.';
      }
      fail('SQL0104N', 'Expected: START HADR ON DATABASE <db> AS PRIMARY | STOP HADR ON DATABASE <db> | TAKEOVER HADR ON DATABASE <db> [BY FORCE]', '42601');
    },

    /* ================= snapshot / db2pd ================= */
    _upTime(db) { const s = Math.max(0, Math.floor((this.now().getTime() - (this.inst.startTime ? this.inst.startTime.getTime() : db.created)) / 1000)); return 'Up ' + Math.floor(s / 86400) + ' days ' + p2(Math.floor(s / 3600) % 24) + ':' + p2(Math.floor(s / 60) % 60) + ':' + p2(s % 60); },
    _pdHdr(db) { return '\nDatabase Member 0 -- Database ' + db.alias + ' -- Active -- ' + this._upTime(db) + ' -- Date ' + tsDb2(this.now()).replace(/\.\d+$/, '.123456') + '\n'; },
    cmdSnapshot(sess, rest) {
      this._needStarted();
      const m = rest.match(/^(database|bufferpools|locks|applications|tablespaces|dynamic sql)\s+(?:on|for)\s+(\S+)/i) || rest.match(/^(applications)\s+(?:on|for)\s+(\S+)/i);
      if (!m) fail('SQL0104N', 'Expected: GET SNAPSHOT FOR DATABASE|BUFFERPOOLS|LOCKS|APPLICATIONS|TABLESPACES ON <db>', '42601');
      const db = this._findDb(m[2]); if (!(db.connections > 0 || db.activated)) return 'SQL1611W  No data was returned by Database System Monitor.  SQLSTATE=00000';
      const kind = m[1].toLowerCase(); const now = tsDb2(this.now());
      const s = db.stats; const bpt = Object.values(db.bpStats).reduce((a, x) => ({ dl: a.dl + x.dl, dp: a.dp + x.dp, il: a.il + x.il, ip: a.ip + x.ip }), { dl: 0, dp: 0, il: 0, ip: 0 });
      if (kind === 'database') return ['', '            Database Snapshot', '', 'Database name                              = ' + db.name, 'Database path                              = /home/db2inst1/db2inst1/NODE0000/SQL00001/MEMBER0000/', 'Input database alias                       = ' + db.alias, 'Database status                            = Active', 'Catalog database partition number          = 0', 'Operating system running at database server= LINUX', 'Location of the database                   = Local', 'First database connect timestamp           = ' + now, 'Snapshot timestamp                         = ' + now, '', 'High water mark for connections            = ' + Math.max(1, db.connections), 'Application connects                       = ' + Math.max(1, db.connections), 'Secondary connects total                   = 0', 'Applications connected currently           = ' + db.connections, '', 'Commit statements attempted                = ' + s.commits, 'Rollback statements attempted              = ' + s.rollbacks, 'Rows deleted                               = 0', 'Rows inserted                              = ' + s.rowsModified, 'Rows read                                  = ' + s.rowsRead, '', 'Lock waits                                 = ' + s.lockWaits, 'Lock timeouts                              = ' + s.lockTimeouts, 'Deadlocks detected                         = ' + s.deadlocks, '', 'Buffer pool data logical reads             = ' + bpt.dl, 'Buffer pool data physical reads            = ' + bpt.dp, 'Buffer pool index logical reads            = ' + bpt.il, 'Buffer pool index physical reads           = ' + bpt.ip, ''].join('\n');
      if (kind === 'bufferpools') { const out = ['', 'Bufferpool Snapshot', '']; Object.keys(db.bufferpools).forEach((n) => { const x = db.bpStats[n] || { dl: 0, dp: 0, il: 0, ip: 0 }; out.push('Bufferpool name                            = ' + n, 'Database name                              = ' + db.name, 'Input database alias                       = ' + db.alias, 'Snapshot timestamp                         = ' + now, '', 'Buffer pool data logical reads             = ' + x.dl, 'Buffer pool data physical reads            = ' + x.dp, 'Buffer pool index logical reads            = ' + x.il, 'Buffer pool index physical reads           = ' + x.ip, ''); }); return out.join('\n'); }
      if (kind === 'locks') { const ks = Object.keys(db.locks); const out = ['', '            Database Lock Snapshot', '', 'Database name                              = ' + db.name, 'Database path                              = /home/db2inst1/db2inst1/NODE0000/SQL00001/MEMBER0000/', 'Input database alias                       = ' + db.alias, 'Locks held                                 = ' + ks.length, 'Applications currently connected           = ' + db.connections, 'Applications currently waiting on locks    = ' + Object.values(this.sessions).filter((x) => x.waiting && x.db === db).length, 'Snapshot timestamp                         = ' + now, '']; ks.forEach((t) => { const h = this.sessions[db.locks[t].sid]; out.push('Application handle                         = ' + (h ? h.handle : '?'), 'Application status                         = UOW Waiting', '   List Of Locks', '   Lock Name                   = 0x01000000010000000000000054', '   Lock Attributes             = 0x00000000', '   Object Type                 = Table', '   Table Name                  = ' + t, '   Table Schema                = ' + db.tables[t].schema, '   Mode                        = ' + db.locks[t].mode, ''); }); return out.join('\n'); }
      if (kind === 'tablespaces') { const out = ['', 'Tablespace Snapshot', '']; Object.values(db.tablespaces).forEach((t) => { const i = this._tsInfo(db, t); out.push('Tablespace name                            = ' + t.name, 'Tablespace ID                              = ' + t.id, 'Tablespace Type                            = ' + (t.type === 'DMS' ? 'Database managed space' : 'System managed space'), 'Tablespace Page size (bytes)               = ' + t.pagesize, 'Tablespace Extent size (pages)             = ' + t.extent, 'Total pages                                = ' + i.total, 'Used pages                                 = ' + i.used, ''); }); return out.join('\n'); }
      return this._listApps(true);
    },
    cmdDb2pd(sess, line) {
      const args = line.replace(/^db2pd\s*/i, '').trim(); this._needStarted();
      if (/^-version/.test(args)) return 'Instance db2inst1 uses 64 bits and DB2 code release SQL12010\nwith level identifier 0F0A0107\nInformational tokens are DB2 v12.1.0.0, s2411221234, DYN2411221234AMD64, Fix Pack 0.';
      if (/^-osinfo/.test(args)) return 'Operating System Information:\n\nOSName:   Linux\nNodeName: db2server\nVersion:  6\nRelease:  1\nMachine:  x86_64\n\nCPU Information:\nTotalCPU    OnlineCPU   ConfigCPU   Speed(MHz) HMTDegree Cores/Socket\n4           4           4           2400       1         4\n\nPhysical Memory and Swap (Megabytes):\nTotalMem    FreeMem     AvailMem    TotalSwap   FreeSwap\n16384       9120        11200       2048        2048';
      const dm = args.match(/-(?:db|d|database)\s+(\S+)/i); if (!dm) return 'Option -' + (args.match(/-(\w+)/) || [, 'x'])[1] + ' requires -db <database> option.';
      const alias = U(dm[1]); const real = this.aliases[alias];
      if (!real) return 'Database ' + alias + ' not activated on database member 0 or this database name cannot be found in the local database directory.\n\nOption -' + (args.match(/-(bufferpools|tablespaces|logs|locks|applications|hadr|dbcfg|transactions|dynamic)/) || [, 'x'])[1] + ' requires -db <database> option.';
      const db = this.dbs[real]; db.alias = alias;
      if (!(db.connections > 0 || db.activated)) return 'Database ' + alias + ' not activated on database member 0 or this database name cannot be found in the local database directory.';
      const hdr = this._pdHdr(db); let m;
      if (/-bufferpools/i.test(args)) {
        const bps = Object.keys(db.bufferpools); const out = [hdr, 'Bufferpools:', 'First Active Pool ID      1', 'Max Bufferpool ID         ' + Math.max(...bps.map((b) => db.bufferpools[b].id)), 'Max Bufferpool ID on Disk ' + Math.max(...bps.map((b) => db.bufferpools[b].id)), 'Num Bufferpools           ' + (bps.length + 4), '', 'Id  Name               PageSz PA-NumPgs  BA-NumPgs  BlkSize PgsLeft CurrentSz PostAlter Automatic'];
        bps.forEach((n) => { const b = db.bufferpools[n]; const sz = b.size === -2 ? 250000 : b.size; out.push(String(b.id).padEnd(3) + ' ' + n.padEnd(18) + ' ' + String(b.pagesize).padEnd(6) + ' ' + String(sz).padEnd(10) + ' 0          0       0       ' + String(sz).padEnd(9) + ' ' + String(sz).padEnd(9) + ' ' + (b.size === -2 ? 'True' : 'False')); });
        ['IBMSYSTEMBP4K', 'IBMSYSTEMBP8K', 'IBMSYSTEMBP16K', 'IBMSYSTEMBP32K'].forEach((n, i) => out.push(String(i + 4 * 0 - 1 - i).padEnd(3) + ' ' + n.padEnd(18) + ' ' + String(4096 << i).padEnd(6) + ' 16         0          0       0       16        16        False'));
        return out.join('\n');
      }
      if (/-tablespaces/i.test(args)) {
        const out = [hdr, 'Tablespaces:', 'Id  Type Content PageSz ExtentSz Auto Prefetch BufID FSC NumCntrs State       Name'];
        Object.values(db.tablespaces).forEach((t) => out.push(String(t.id).padEnd(3) + ' ' + (t.type === 'DMS' ? 'DMS ' : 'SMS ') + String(({ ANY: 'Regular', LARGE: 'Large', SYSTEMP: 'SysTmp', USRTEMP: 'UsrTmp' })[t.content]).padEnd(7) + ' ' + String(t.pagesize).padEnd(6) + ' ' + String(t.extent).padEnd(8) + ' ' + (t.auto ? 'Yes' : 'No ') + '  ' + String(t.prefetch < 0 ? t.extent : t.prefetch).padEnd(8) + ' ' + String(db.bufferpools[t.bp].id).padEnd(5) + ' On  ' + String(t.containers.length).padEnd(8) + ' 0x' + t.state.toString(16).padStart(8, '0') + '  ' + t.name));
        out.push('', 'Tablespace Autoresize Statistics:', 'Id  AS  AR  InitSize   IncSize   IIP MaxSize   LastResize LRF');
        Object.values(db.tablespaces).forEach((t) => out.push(String(t.id).padEnd(3) + ' ' + (t.auto ? 'Yes' : 'No ') + ' ' + (t.autoresize ? 'Yes' : 'No ') + ' ' + String(t.initial * t.pagesize).padEnd(10) + ' ' + t.increase.padEnd(9) + ' No  ' + t.maxsize));
        return out.join('\n');
      }
      if (/-logs/i.test(args)) { const cur = db.logSeq; return [hdr, 'Logs:', 'Current Log Number            ' + cur, 'Pages Written                 ' + (db.logCount % 5) * 3, 'Method 1 Archive Status       ' + (this._archiving(db) ? 'Success' : 'n/a'), 'Method 1 Next Log to Archive  ' + (this._archiving(db) ? this._logName(cur) : 'n/a'), 'Method 1 First Failure        n/a', 'Method 2 Archive Status       n/a', 'Log Chain ID                  0', '', 'StartLSN         State    Size       Pages      Filename', '0x00000000000A1B2C 0x00000000 ' + String(cur * 1000 + 1000).padEnd(10) + ' ' + String(db.cfg.LOGFILSIZ).padEnd(10) + ' ' + this._logName(cur)].join('\n'); }
      if (/-locks/i.test(args)) {
        const out = [hdr, 'Locks:', 'Address    TranHdl    Lockname                   Type           Mode Sts Owner      Dur HoldCount Att        ReleaseFlg TableNm            SchemaNm'];
        Object.keys(db.locks).forEach((t, i) => { const h = this.sessions[db.locks[t].sid]; out.push('0x0000' + (7000 + i).toString(16).padEnd(5) + ' ' + String(h ? h.handle : 0).padEnd(10) + ' 000200' + String(i).padStart(2, '0') + '000000000000000054 Table          ..' + db.locks[t].mode + '  G   ' + String(h ? h.handle : 0).padEnd(10) + ' 1   0         0x00000000 0x40000000 ' + t.padEnd(18) + ' ' + db.tables[t].schema); });
        Object.values(this.sessions).filter((s) => s.waiting && s.db === db).forEach((s) => out.push('0x00007fff ' + String(s.handle).padEnd(10) + ' 000200000000000000000054 Table          ..S  W   ' + String(s.handle).padEnd(10) + ' 1   0         0x00000000 0x40000000 ' + String(s.waiting.table).padEnd(18) + ' DB2INST1'));
        if (out.length === 2) out.push('(no locks held)'); return out.join('\n');
      }
      if (/-applications/i.test(args)) { const out = [hdr, 'Applications:', 'Address    AppHandl [nod-index] NumAgents  CoorEDUID  Status                  C-AnchID C-StmtUID  L-AnchID L-StmtUID Appid']; Object.values(this.sessions).filter((s) => s.db === db).forEach((s) => out.push('0x00007f' + String(s.id).padEnd(3) + '  ' + String(s.handle).padEnd(8) + ' [000-' + String(s.handle).padStart(5, '0') + '] 1          ' + String(4000 + s.id).padEnd(10) + ' ' + (s.waiting ? 'Lock-wait' : s.txn ? 'UOW-Waiting' : 'Connect-Completed').padEnd(23) + ' 0        0          0        0         *LOCAL.db2inst1.' + (26111700 + s.id * 31))); return out.join('\n'); }
      if (/-transactions/i.test(args)) { const out = [hdr, 'Transactions:', 'Address    AppHandl [nod-index] TranHdl    Locks State Tflag      Tflag2     Firstlsn         Lastlsn          LogSpace  SpaceReserved TID              AxRegCnt GXID']; Object.values(this.sessions).filter((s) => s.db === db && s.txn).forEach((s) => out.push('0x00007e' + s.id + '  ' + String(s.handle).padEnd(8) + ' [000-' + String(s.handle).padStart(5, '0') + '] ' + String(s.handle + 1).padEnd(10) + ' ' + Object.keys(db.locks).filter((t) => db.locks[t].sid === s.id).length + '     WRITE 0x00000000 0x00000000 0x00000000009D1A2F 0x00000000009D2B30 1220      2480          0x00000000001A4F  1        0')); if (out.length === 2) out.push('(no open transactions)'); return out.join('\n'); }
      if (/-hadr/i.test(args)) {
        if (!db.hadr) return hdr + '\nDatabase ' + alias + ' not activated on database member 0 or this database is not an HADR database.\n(HADR is not started - see Module 12.)';
        const role = this._hadrRole(db, sess); const prim = db.hadr.primaryHost === 'primary' ? ['db2server', 'db2standby'] : ['db2standby', 'db2server'];
        return [hdr, '                            HADR_ROLE = ' + role, '                          REPLAY_TYPE = PHYSICAL', '                        HADR_SYNCMODE = ' + db.hadr.sync, '                           STANDBY_ID = 1', '                        LOG_STREAM_ID = 0', '                           HADR_STATE = ' + db.hadr.state, '                  PRIMARY_MEMBER_HOST = ' + prim[0], '                     PRIMARY_INSTANCE = db2inst1', '                       PRIMARY_MEMBER = 0', '                  STANDBY_MEMBER_HOST = ' + prim[1], '                     STANDBY_INSTANCE = db2inst1', '                       STANDBY_MEMBER = 0', '                  HADR_CONNECT_STATUS = CONNECTED', '           HEARTBEAT_INTERVAL(seconds) = 30', '                 HADR_TIMEOUT(seconds) = 120', '        TIME_SINCE_LAST_RECV(seconds) = 1', '             PEER_WAIT_LIMIT(seconds) = 0', '          LOG_HADR_WAIT_CUR(seconds) = 0.000', '     PRIMARY_LOG_FILE,PAGE,POS = ' + this._logName(db.logSeq) + ', 12, 55000000', '     STANDBY_LOG_FILE,PAGE,POS = ' + this._logName(db.logSeq) + ', 12, 55000000', '               HADR_LOG_GAP(bytes) = 0', '   STANDBY_REPLAY_LOG_FILE,PAGE,POS = ' + this._logName(db.logSeq) + ', 12, 55000000', '                    STANDBY_RECV_REPLAY_GAP(bytes) = 0'].join('\n');
      }
      if (/-dbcfg/i.test(args)) return hdr + '\nDatabase Configuration Settings:\n\nDatabase Member 0 -- Database ' + alias + ' -- Active\n\n' + DB_CFGLINES(db);
      if (/-dynamic/i.test(args)) { const out = [hdr, 'Dynamic Cache:', 'NumExecutions  Statement']; Object.keys(db.stmtStats).forEach((k) => out.push(String(db.stmtStats[k].n).padEnd(14) + ' ' + k)); return out.join('\n'); }
      return 'Usage: db2pd -db <name> -bufferpools | -tablespaces | -logs | -locks | -applications | -transactions | -hadr | -dbcfg | -dynamic';
    },

    /* ================= explain ================= */
    cmdExplainPlan(sess, line) {
      const db = this._needConn(sess);
      const m = line.match(/^explain\s+(?:plan|all)\s*(?:set\s+queryno\s*=\s*\d+\s*)?(?:with\s+snapshot\s*)?for\s+([\s\S]+)$/i);
      if (!m) fail('SQL0104N', 'Expected: EXPLAIN PLAN FOR <select statement>', '42601');
      const { sql, info } = this._translate(db, sess, m[1].trim());
      const eqp = this._eqp(db, db.sql, sql);
      if (!/^(select|with|values)$/.test(info.kind) && !info.writes) fail('SQL0104N', 'EXPLAIN supports SELECT/INSERT/UPDATE/DELETE statements.', '42601');
      try { if (/^(select|with)/i.test(sql)) db.sql.exec('EXPLAIN QUERY PLAN ' + sql); } catch (e) { throw this._mapErr(e, sess, db, info, m[1]); }
      sess.plan = { orig: m[1].trim(), sql, eqp, tables: info.tables, kind: info.kind, at: this.now().getTime(), db: db.name };
      return OK;
    },
    _buildPlan(db, plan) {
      const ops = []; let cost = 0;
      const card = (t) => { const tb = db.tables[t]; return tb && tb.stats ? tb.stats.card : this._rowCount(db, t); };
      const leaves = [];
      plan.eqp.forEach((d) => {
        let m;
        if ((m = d.match(/^SCAN (?:TABLE )?"?(\w+)"?/i)) && db.tables[U(m[1])]) { const t = U(m[1]); const c = card(t); leaves.push({ op: 'TBSCAN', tab: t, rows: c, cost: Math.round((6.5 + c * 0.0155) * 100) / 100, info: 'Relation Scan' }); }
        else if ((m = d.match(/^SEARCH (?:TABLE )?"?(\w+)"?\s+USING (COVERING )?INDEX "?(\w+)"?/i)) && db.tables[U(m[1])]) { const t = U(m[1]); const c = card(t); const r = Math.max(1, Math.round(c * 0.02)); const ix = leaves.push({ op: 'IXSCAN', tab: t, idx: U(m[3]), rows: r, cost: Math.round((0.13 + Math.log2(c + 2) * 0.06) * 100) / 100, info: 'Index Scan' }); if (!m[2]) { leaves[ix - 1] = { op: 'FETCH', tab: t, rows: r, cost: Math.round((leaves[ix - 1].cost + 3.4 + r * 0.01) * 100) / 100, info: 'Fetch Data', child: leaves[ix - 1] }; } }
        else if ((m = d.match(/^SEARCH (?:TABLE )?"?(\w+)"?\s+USING (?:INTEGER )?PRIMARY KEY/i)) && db.tables[U(m[1])]) { const t = U(m[1]); leaves.push({ op: 'IXSCAN', tab: t, idx: 'PRIMARY KEY', rows: 1, cost: 0.1, info: 'Index Scan (primary key)' }); }
      });
      let node = null;
      if (leaves.length === 1) node = leaves[0]; else if (leaves.length > 1) node = leaves.reduce((a, b) => ({ op: leaves.every((x) => x.op === 'TBSCAN') ? 'HSJOIN' : 'NLJOIN', rows: Math.max(a.rows, b.rows), cost: Math.round((a.cost + b.cost + 1.2) * 100) / 100, kids: [a, b], info: 'Join' }));
      if (!node) node = { op: plan.kind === 'select' ? 'TBSCAN' : plan.kind.toUpperCase(), tab: plan.tables[0], rows: 1, cost: 1, info: plan.kind };
      if (plan.eqp.some((d) => /TEMP B-TREE FOR ORDER BY/i.test(d))) node = { op: 'SORT', rows: node.rows, cost: Math.round((node.cost + 1 + node.rows * 0.01) * 100) / 100, kids: [node], info: 'Sort' };
      if (plan.eqp.some((d) => /TEMP B-TREE FOR (GROUP BY|DISTINCT)/i.test(d))) node = { op: 'GRPBY', rows: Math.max(1, Math.round(node.rows / 4)), cost: Math.round((node.cost + 0.8) * 100) / 100, kids: [node], info: 'Group By' };
      const root = { op: 'RETURN', rows: node.rows, cost: Math.round((node.cost + 0.12) * 100) / 100, kids: [node], info: 'Return Data' };
      return root;
    },
    _renderPlan(db, plan, style) {
      const root = this._buildPlan(db, plan); let n = 0; const lines = []; const details = [];
      const walk = (nd, depth) => {
        nd.id = ++n; const kids = nd.kids || (nd.child ? [nd.child] : []);
        lines.push('  '.repeat(depth) + (depth ? '+- ' : '') + nd.op.padEnd(8) + ' (' + String(nd.id).padStart(2) + ')  cost ' + String(nd.cost).padEnd(8) + ' rows ' + nd.rows + (nd.tab ? '   ' + (nd.idx ? 'INDEX ' + db.tables[nd.tab].schema + '.' + nd.idx + ' on ' : 'TABLE ') + db.tables[nd.tab].schema + '.' + nd.tab : ''));
        details.push(nd); kids.forEach((k) => walk(k, depth + 1));
      };
      walk(root, 0);
      const warn = plan.tables.filter((t) => db.tables[t] && !db.tables[t].stats);
      const out = ['Original Statement:', '------------------', plan.orig, '', 'Optimized Statement:', '-------------------', plan.sql.replace(/\s+/g, ' '), '', 'Access Plan:', '-----------', '        Total Cost:             ' + root.cost, '        Query Degree:           1', ''];
      out.push(...lines, '', 'Plan Details:', '-------------');
      details.forEach((nd) => { out.push(nd.id + ') ' + nd.op + ': (' + nd.info + ')', '     Cumulative Total Cost:      ' + nd.cost, '     Estimated Cardinality:      ' + nd.rows, nd.tab ? '     Table: ' + db.tables[nd.tab].schema + '.' + nd.tab : '', nd.idx ? '     Index: ' + nd.idx : '', ''); });
      if (warn.length) { out.push('Extended Diagnostic Information:', '--------------------------------'); warn.forEach((t, i) => out.push('Diagnostic Identifier:   ' + (i + 1), 'Diagnostic Details:      EXP0021W  Table with name "' + t + '", schema "' + db.tables[t].schema + '" has not had runstats run on it.  This may result in a sub-optimal access plan and poor performance.', '')); }
      return out.filter((x, i, a) => !(x === '' && a[i - 1] === '' )).join('\n');
    },
    cmdExfmt(sess, line) {
      const args = line.replace(/^db2exfmt\s*/i, ''); const dm = args.match(/-d\s+(\S+)/i); if (!dm) return 'Usage: db2exfmt -d <db> -1 [-o <output file>]\n(Explain data must exist: first run  db2 "explain plan for <select ...>")';
      const db = this._findDb(dm[1]); const plan = sess.plan;
      if (!plan || plan.db !== db.name) return 'SQL0219N  The required Explain table "DB2INST1.EXPLAIN_INSTANCE" does not exist or contains no rows for this statement.\n(simulator) Run  db2 "explain plan for <your select>"  first, then db2exfmt -d ' + db.alias + ' -1';
      const body = ['DB2 Universal Database Version 12.1, 5622-044 (c) Copyright IBM Corp. 1991, 2024', 'Licensed Material - Program Property of IBM', 'IBM DATABASE 2 Explain Table Format Tool', '', '******************** EXPLAIN INSTANCE ********************', '', 'DB2_VERSION:       12.01.0', 'SOURCE_NAME:       SQLC2P29', 'SOURCE_SCHEMA:     NULLID', 'EXPLAIN_TIME:      ' + tsDb2(new Date(plan.at)), 'EXPLAIN_REQUESTER: ' + sess.user, '', 'Database Context:', '----------------', '        Parallelism:          None', '        CPU Speed:            2.4e-07', '        Comm Speed:           100', '        Buffer Pool size:     ' + (db.bufferpools.IBMDEFAULTBP.size === -2 ? 'AUTOMATIC' : db.bufferpools.IBMDEFAULTBP.size), '        Sort Heap size:       AUTOMATIC', '        Database Heap size:   AUTOMATIC', '        Lock List size:       AUTOMATIC', '        Maximum Lock List:    AUTOMATIC', '        Average Applications: AUTOMATIC', '        Locks Available:      AUTOMATIC', '', '        Package Context:', '        ---------------', '                SQL Type:           Dynamic', '                Optimization Level: ' + db.cfg.DFT_QUERYOPT, '                Blocking:           Block All Cursors', '                Isolation Level:    Cursor Stability', '', '---------------- STATEMENT 1  SECTION 1 ----------------', '', this._renderPlan(db, plan)].join('\n');
      const om = args.match(/-o\s+(\S+)/i);
      if (om) { this.files[om[1]] = { type: 'text', content: body + '\n' }; this._mkdirs(om[1].replace(/\/[^/]*$/, '') || '/'); return 'DB2 Universal Database Version 12.1, 5622-044\nLicensed Material - Program Property of IBM\nIBM DATABASE 2 Explain Table Format Tool\n\nConnecting to the Database.\nConnect to Database Successful.\nOutput is in ' + om[1] + '.\nExecuting Connect Reset -- Connect Reset was Successful.'; }
      return body;
    },
    cmdExpln(sess, line) {
      const dm = line.match(/-d(?:atabase)?\s+(\S+)/i); const qm = line.match(/-q(?:uery)?\s+("[^"]*"|'[^']*'|.+?)(?=\s+-\w|$)/i);
      if (!dm || !qm) return 'Usage: db2expln -d <db> -q "<statement>" -t   (-t = terminal output)';
      const db = this._findDb(dm[1]); const stmt = unq(qm[1]); const s = this.sessions[1]; const tmp = Object.assign({}, sess, { db });
      const { sql, info } = this._translate(db, tmp, stmt); const eqp = this._eqp(db, db.sql, sql);
      const plan = { orig: stmt, sql, eqp, tables: info.tables, kind: info.kind };
      const root = this._buildPlan(db, plan); const out = ['', 'DB2 Universal Database Version 12.1, 5622-044 (c) Copyright IBM Corp. 1991, 2024', 'Licensed Material - Program Property of IBM', 'IBM DATABASE 2 SQL and XQUERY Explain Tool', '', '******************** DYNAMIC ***************************************', '', '==================== STATEMENT ==========================================', '', '\tIsolation Level          = Cursor Stability', '\tBlocking                 = Block Unambiguous Cursors', '\tQuery Optimization Class = ' + db.cfg.DFT_QUERYOPT, '', '\tPartition Parallel       = No', '\tIntra-Partition Parallel = No', '', 'Statement:', '', '  ' + stmt, '', '', 'Section Code Page = 1208', '', 'Estimated Cost = ' + root.cost, 'Estimated Cardinality = ' + root.rows, ''];
      const walk = (nd) => { (nd.kids || []).forEach(walk); if (nd.op === 'TBSCAN') out.push('Access Table Name = ' + db.tables[nd.tab].schema + '.' + nd.tab + '  ID = 2,' + (db.tables[nd.tab].ts === 'USERSPACE1' ? 5 : 6), '|  Relation Scan', '|  |  Prefetch: Eligible', '|  Lock Intents', '|  |  Table: Intent Share', '|  |  Row  : Next Key Share'); if (nd.op === 'FETCH' || nd.op === 'IXSCAN') { const ix = nd.child || nd; out.push('Access Table Name = ' + db.tables[nd.tab].schema + '.' + nd.tab + '  ID = 2,5', '|  Index Scan:  Name = ' + db.tables[nd.tab].schema + '.' + (ix.idx || nd.idx) + '  ID = 1', '|  |  Regular Index (Not Clustered)', '|  |  Index Columns:', '|  |  |  1: ' + ((Object.values(db.indexes).find((i) => i.name === (ix.idx || nd.idx)) || { cols: ['?'] }).cols[0]) + ' (Ascending)', '|  #Key Columns = 1', '|  |  Start Key: Inclusive Value', '|  |  Stop Key: Inclusive Value', '|  Data Prefetch: None', '|  Index Prefetch: None', '|  Lock Intents', '|  |  Table: Intent Share', '|  |  Row  : Next Key Share'); } if (nd.op === 'SORT') out.push('Sort', '|  Sort Type: Unique/Order'); if (nd.op === 'HSJOIN' || nd.op === 'NLJOIN') out.push(nd.op === 'HSJOIN' ? 'Hash Join' : 'Nested Loop Join'); };
      walk(root); out.push('Return Data to Application', '|  #Columns = ' + (stmt.match(/select\s+(.*?)\s+from/i) ? stmt.match(/select\s+(.*?)\s+from/i)[1].split(',').length : 1), '', 'End of section', '');
      return out.join('\n');
    },

    /* ================= db2look / db2diag ================= */
    cmdLook(sess, line) {
      const args = line.replace(/^db2look\s*/i, ''); const dm = args.match(/-d\s+(\S+)/i); if (!dm) return 'Usage: db2look -d <db> [-e] [-l] [-x] [-t <table>] [-o <file>]';
      const db = this._findDb(dm[1]); const only = (args.match(/-t\s+(\S+)/i) || [])[1]; const out = ['-- This CLP file was created using DB2LOOK Version "12.1"', '-- Timestamp: ' + this.now().toString(), '-- Database Name: ' + db.alias, '-- Database Manager Version: DB2/LINUXX8664 Version 12.1.0', '-- Database Codepage: 1208', '-- Database Collating Sequence is: IDENTITY', '', 'CONNECT TO ' + db.alias + ';', ''];
      if (/\s-l\b/.test(' ' + args)) {
        out.push('------------------------------------', '-- DDL Statements for BUFFERPOOLS', '------------------------------------', '');
        Object.keys(db.bufferpools).forEach((n) => { const b = db.bufferpools[n]; if (n !== 'IBMDEFAULTBP') out.push('CREATE BUFFERPOOL "' + n + '" SIZE ' + (b.size === -2 ? 'AUTOMATIC' : b.size) + ' PAGESIZE ' + b.pagesize + ';'); else out.push('ALTER BUFFERPOOL "IBMDEFAULTBP" SIZE ' + (b.size === -2 ? 'AUTOMATIC' : b.size) + ';'); });
        out.push('', '------------------------------------', '-- DDL Statements for TABLESPACES', '------------------------------------', '');
        Object.values(db.tablespaces).filter((t) => t.id > 2).forEach((t) => out.push('CREATE ' + ({ ANY: 'REGULAR', LARGE: 'LARGE', SYSTEMP: 'SYSTEM TEMPORARY', USRTEMP: 'USER TEMPORARY' })[t.content] + ' TABLESPACE "' + t.name + '" IN DATABASE PARTITION GROUP IBMDEFAULTGROUP PAGESIZE ' + t.pagesize + ' MANAGED BY ' + (t.auto ? 'AUTOMATIC STORAGE' : (t.type === 'DMS' ? 'DATABASE USING (' + t.containers.map((c) => c.type.toUpperCase() + " '" + c.name + "' " + c.pages).join(', ') + ')' : 'SYSTEM USING (' + t.containers.map((c) => "'" + c.name + "'").join(', ') + ')')) + ' EXTENTSIZE ' + t.extent + ' BUFFERPOOL "' + t.bp + '";'));
        out.push('');
      }
      if (/\s-e\b/.test(' ' + args)) {
        Object.values(db.tables).filter((t) => !only || t.name === U(only)).forEach((t) => {
          const cols = this._tableCols(db, t.name);
          out.push('------------------------------------------------', '-- DDL Statements for Table "' + t.schema + '"."' + t.name + '"', '------------------------------------------------', '', 'CREATE TABLE "' + t.schema + '"."' + t.name + '"  (');
          cols.forEach((c, i) => { const p = this._typeParts(c.type); const ty = /^(VARCHAR|CHAR|DECIMAL|NUMERIC)$/.test(p.name) ? p.name + '(' + p.len + (p.scale ? ',' + p.scale : '') + ')' : p.name; out.push('\t\t  "' + c.name + '" ' + ty + (c.notnull || c.pk ? ' NOT NULL' : '') + (i < cols.length - 1 ? ' , ' : ' )')); });
          out.push('\t\t IN "' + t.ts + '" ORGANIZE BY ROW; ', '');
          Object.values(db.indexes).filter((i) => i.table === t.name).forEach((i) => out.push('CREATE ' + (i.unique ? 'UNIQUE ' : '') + 'INDEX "' + i.schema + '"."' + i.name + '" ON "' + t.schema + '"."' + t.name + '" (' + i.cols.map((c) => '"' + c + '" ASC').join(', ') + ') COMPRESS NO INCLUDE NULL KEYS ALLOW REVERSE SCANS;'));
          out.push('');
        });
        Object.values(db.views).forEach((v) => out.push('-- DDL Statements for View "' + v.schema + '"."' + v.name + '"', v.text + ';', ''));
      }
      if (/\s-x\b/.test(' ' + args)) { out.push('------------------------------------', '-- GRANT statements', '------------------------------------', ''); db.auth.filter((a) => a.grantee !== 'DB2INST1' && a.grantee !== 'PUBLIC').forEach((a) => out.push('GRANT ' + a.priv + ' ON DATABASE TO ' + (a.gtype === 'G' ? 'GROUP' : a.gtype === 'R' ? 'ROLE' : 'USER') + ' ' + a.grantee + ';')); db.tabauth.forEach((a) => out.push('GRANT ' + a.priv + ' ON TABLE "' + (db.tables[a.table] || { schema: 'DB2INST1' }).schema + '"."' + a.table + '" TO ' + (a.gtype === 'R' ? 'ROLE ' : a.gtype === 'G' ? (a.grantee === 'PUBLIC' ? '' : 'GROUP ') : 'USER ') + a.grantee + ';')); out.push(''); }
      out.push('COMMIT WORK;', 'CONNECT RESET;', 'TERMINATE;');
      const om = args.match(/-o\s+(\S+)/i); if (om) { this.files[om[1]] = { type: 'text', content: out.join('\n') + '\n' }; return 'db2look output written to ' + om[1]; }
      return out.join('\n');
    },
    cmdDiag(line) {
      const lv = (line.match(/-l\s+(\S+)/i) || [])[1]; const g = (line.match(/-g\s+(\S+)/i) || [])[1];
      const levels = lv ? lv.toLowerCase().split(',') : null; let ents = this.diag.filter((e) => !levels || levels.includes(e.level.toLowerCase()));
      if (g) { const p = g.replace(/^.*[=:!~]+/, '').toLowerCase(); ents = ents.filter((e) => (e.msg + e.level).toLowerCase().includes(p)); }
      if (!ents.length) return '(no matching db2diag.log entries)';
      return ents.slice(-12).map((e, i) => { const d = e.ts; return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '-' + p2(d.getHours()) + '.' + p2(d.getMinutes()) + '.' + p2(d.getSeconds()) + '.' + String(100000 + i * 1111) + '+330 I' + (1000 + i) + 'E' + (300 + e.msg.length) + '          LEVEL: ' + e.level + '\nPID     : 4172                 TID : 140212345678848 PROC : db2sysc 0\nINSTANCE: db2inst1             NODE : 000            DB   : SAMPLE\nHOSTNAME: db2server\nFUNCTION: ' + e.fn + '\nMESSAGE : ' + e.msg + '\n'; }).join('\n');
    }
  };
  function DB_CFGLINES(db) { return Object.keys(db.cfg).map((k) => '  ' + k.padEnd(24) + ' ' + db.cfg[k]).join('\n'); }
  Object.assign(Db2Sim.prototype, A);
});
