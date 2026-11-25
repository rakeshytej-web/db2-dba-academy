/* Course registry + helpers shared by all module files */
(function (root) {
  'use strict';
  const DOCS = 'https://www.ibm.com/docs/en/db2/12.1.x';
  const DOCS115 = 'https://www.ibm.com/docs/en/db2/11.5.x';
  const search = (q) => 'https://www.ibm.com/docs/en/search/' + encodeURIComponent(q) + '?scope=SSEPGG_12.1.0';
  const COURSE = {
    modules: [],
    add(m) { this.modules.push(m); this.modules.sort((a, b) => a.n - b.n); },
    DOCS, DOCS115, search,
    /* standard resource links */
    res: {
      docs: { title: 'Db2 12.1 documentation (IBM Docs)', url: DOCS, note: 'The authoritative reference. Use the search box for any command or message code.' },
      docs115: { title: 'Db2 11.5 documentation (IBM Docs)', url: DOCS115, note: 'Same concepts; many production systems still run 11.5.' },
      community: { title: 'IBM Db2 Community', url: 'https://community.ibm.com/community/user/datamanagement/home', note: 'Forums, blogs and release news from IBM and Db2 experts.' },
      redbooks: { title: 'IBM Redbooks', url: 'https://www.redbooks.ibm.com', note: 'Free in-depth books; search for "Db2 LUW".' },
      training: { title: 'IBM Training & Certification', url: 'https://www.ibm.com/training', note: 'Official courses and the current Db2 certification exams.' },
      db2: { title: 'IBM Db2 product page', url: 'https://www.ibm.com/products/db2', note: 'Editions, Community Edition download and overview.' }
    },
    S(sim) { // helper object handed to lab checks
      return {
        sim,
        db: (n) => sim.dbs[String(n).toUpperCase()],
        ran: (re) => sim.events.some((e) => e.ok && re.test(e.cmd)),
        failed: (code) => sim.events.some((e) => e.err === code || (!e.ok && new RegExp(code).test(e.out || ''))),
        rows: (db, sql) => { const r = db.sql.exec(sql); return r.length ? r[0].values : []; }
      };
    }
  };
  root.COURSE = COURSE;
})(typeof window !== 'undefined' ? window : global);
