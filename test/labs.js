// Runs every lab's solution headlessly and asserts all checks pass + quiz sanity.
const path = require('path'); const root = path.join(__dirname, '..', 'public', 'js');
const initSqlJs = require(process.env.SQLJS || 'sql.js');
global.window = undefined;
const Db2Sim = require(path.join(root, 'sim.js'));
require(path.join(root, 'sim-sql.js'))(Db2Sim); require(path.join(root, 'sim-admin.js'))(Db2Sim);
require(path.join(root, 'course/core.js'));
['m01-03', 'm04-06', 'm07-09', 'm10-12'].forEach((f) => require(path.join(root, 'course', f + '.js')));
const COURSE = global.COURSE;
(async () => {
  const SQL = await initSqlJs(); let fails = 0, labs = 0;
  const only = process.argv[2];
  for (const m of COURSE.modules) {
    if (m.quiz.length < 6) { console.log('QUIZ short', m.id); fails++; }
    m.quiz.forEach((q, i) => { if (!(q.a >= 0 && q.a < q.o.length) || !q.why) { console.log('QUIZ bad', m.id, i); fails++; } });
    for (const lab of m.labs) {
      const id = m.id + '/' + lab.id; if (only && !id.includes(only)) continue; labs++;
      let clock = Date.UTC(2026, 10, 19, 10, 0, 0); const sim = new Db2Sim(SQL, { now: () => new Date(clock += 3000) });
      const sess = {}; const sid = (t) => sess[t || 0] ?? (sess[t || 0] = sim.newSession());
      const caps = {}; let last = '';
      const run = (c, t) => { last = sim.run(sid(t), c); return last; };
      try {
        lab.setup.forEach((c) => run(c, 0));
        for (let c of lab.solution) {
          let t = 0, cap;
          if (typeof c === 'object') { t = c.t || 0; cap = c.cap; c = c.cmd; }
          c = c.replace(/\$\{(\w+)\}/g, (_, k) => caps[k]);
          run(c, t);
          if (cap) { const m2 = last.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})\.(\d{2})\.(\d{2})/); caps[cap] = m2 ? m2[0] : ''; }
        }
        const S = COURSE.S(sim);
        lab.checks.forEach((ck) => { let ok = false, err = ''; try { ok = !!ck.f(S); } catch (e) { err = e.message; } if (!ok) { fails++; console.log('FAIL', id, '-', ck.d, err); } });
        console.log(id, "done"); if(process.env.DBG) sim.events.forEach(e=>console.log(" ",e.ok,e.cmd.slice(0,70)));
      } catch (e) { fails++; console.log('ERROR', id, e.stack.split('\n').slice(0, 3).join(' | ')); }
    }
  }
  console.log(labs + ' labs, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
})();
