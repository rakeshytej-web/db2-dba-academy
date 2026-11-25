/* Db2 DBA Academy - UI */
(function () {
  'use strict';
  const C = window.COURSE, $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const KEY = 'db2academy.v1'; let SQL, sim, skew = 0, P, tabs = [], cur = 0, curLab = null, curLabMod = null;
  const loadP = () => { try { const p = JSON.parse(localStorage.getItem(KEY)); if (p) return Object.assign({ lessons: {}, labs: {}, quiz: {}, exam: { best: 0, attempts: 0 } }, p); } catch (e) {} return { lessons: {}, labs: {}, quiz: {}, exam: { best: 0, attempts: 0 } }; };
  const saveP = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} };
  const toast = (m) => { const t = document.createElement('div'); t.textContent = m; t.style.cssText = 'position:fixed;right:18px;top:18px;background:#3ecf8e;color:#04210f;padding:10px 16px;border-radius:10px;z-index:20;font-weight:600'; document.body.appendChild(t); setTimeout(() => t.remove(), 3500); };

  /* ---------- simulator + terminals ---------- */
  function newSim() {
    skew = 0; sim = new window.Db2Sim(SQL, { now: () => new Date(Date.now() + skew) }); tabs = [];
    for (let i = 0; i < 2; i++) { tabs.push({ sid: sim.newSession(), hist: [], hi: 0, el: document.createElement('div') }); }
    cur = 0; drawTabs(); showTab(0);
    tabs.forEach((t) => { t.el.innerHTML = '<span class="sys">Db2 DBA Academy simulator – terminal ' + (tabs.indexOf(t) + 1) + '. Type  help  to start. (Simulated Db2, not the real product.)</span>\n'; });
  }
  function drawTabs() { $('#tabs').innerHTML = tabs.map((t, i) => '<button data-t="' + i + '" class="' + (i === cur ? 'on' : '') + '">Terminal ' + (i + 1) + '</button>').join(' '); $$('#tabs button').forEach((b) => b.onclick = () => showTab(+b.dataset.t)); }
  function showTab(i) { cur = i; drawTabs(); const o = $('#out'); o.innerHTML = ''; o.appendChild(tabs[i].el); setPrompt(); scrollEnd(); $('#cmd').focus(); }
  function setPrompt() { const s = sim.sessions[tabs[cur].sid]; $('#prompt').textContent = '[' + (s.user || 'db2inst1').toLowerCase() + '@' + (s.host === 'standby' ? 'db2standby' : 'db2server') + ' ~]$'; }
  const scrollEnd = () => { const t = $('#term'); t.scrollTop = t.scrollHeight; };
  function print(tab, html) { tabs[tab].el.insertAdjacentHTML('beforeend', html); if (tab === cur) scrollEnd(); }
  function exec(line, tab) {
    tab = tab == null ? cur : tab; const T = tabs[tab]; const s = sim.sessions[T.sid];
    print(tab, '<span class="cmdln">[' + (s.user || '').toLowerCase() + '@' + (s.host === 'standby' ? 'db2standby' : 'db2server') + ' ~]$ ' + esc(line) + '</span>\n');
    let out; try { out = sim.run(T.sid, line); } catch (e) { out = 'Internal simulator error: ' + e.message; }
    if (out === '\u0000CLEAR') { T.el.innerHTML = ''; } else if (out) print(tab, (/^(SQL\d+N|SQL\d+C|DB21\d+E|bash:)/m.test(out) ? '<span class="err">' + esc(out) + '</span>' : esc(out)) + '\n');
    if (tab === cur) setPrompt(); evalChecks(); return out;
  }
  function toLines(text) { const out = []; let acc = ''; text.split('\n').forEach((l) => { if (/^\s*--/.test(l)) return; if (/\\\s*$/.test(l)) { acc += l.replace(/\\\s*$/, ''); return; } acc += l; if (acc.trim()) out.push(acc.trim()); acc = ''; }); return out; }
  function runText(text, tab) { toLines(text).forEach((l) => exec(l, tab)); $('#cmd').focus(); }
  const CANDS = ['db2start', 'db2stop', 'db2level', 'db2set -all', 'db2pd -db ', 'db2look -d ', 'db2diag', 'db2exfmt -d ', 'db2ckbkp -h ', 'db2 create database ', 'db2 connect to ', 'db2 connect reset', 'db2 list db directory', 'db2 list applications show detail', 'db2 list tablespaces show detail', 'db2 list history backup all for ', 'db2 get dbm cfg', 'db2 get db cfg for ', 'db2 update db cfg for ', 'db2 update dbm cfg using ', 'db2 backup database ', 'db2 restore database ', 'db2 rollforward database ', 'db2 runstats on table ', 'db2 reorg table ', 'db2 reorgchk update statistics on table all', 'db2 export to ', 'db2 import from ', 'db2 load from ', 'db2 grant ', 'db2 revoke ', 'db2 create role ', 'db2 create tablespace ', 'db2 create bufferpool ', 'db2 start hadr on database ', 'db2 takeover hadr on database ', 'db2 force application all', 'db2 terminate', 'help', 'clear', 'ls', 'mkdir -p ', 'cat ', 'useradd ', 'ssh db2standby', 'exit'];
  function initInput() {
    const inp = $('#cmd');
    inp.addEventListener('keydown', (e) => {
      const T = tabs[cur];
      if (e.key === 'Enter') { const v = inp.value; inp.value = ''; if (v.trim()) { T.hist.push(v); T.hi = T.hist.length; } if (v.trim() || true) exec(v, cur); }
      else if (e.key === 'ArrowUp') { if (T.hi > 0) inp.value = T.hist[--T.hi]; e.preventDefault(); }
      else if (e.key === 'ArrowDown') { T.hi = Math.min(T.hist.length, T.hi + 1); inp.value = T.hist[T.hi] || ''; e.preventDefault(); }
      else if (e.key === 'Tab') { e.preventDefault(); const v = inp.value; const m = CANDS.filter((c) => c.startsWith(v.toLowerCase()) && c !== v); if (m.length === 1) inp.value = m[0]; else if (m.length > 1) print(cur, '<span class="sys">' + esc(m.join('   ')) + '</span>\n'); }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); T.el.innerHTML = ''; }
    });
    inp.addEventListener('paste', (e) => { const t = (e.clipboardData || window.clipboardData).getData('text'); if (t.includes('\n')) { e.preventDefault(); runText(t, cur); } });
    $('#term').addEventListener('click', () => { if (!getSelection().toString()) inp.focus(); });
    $('#btnClear').onclick = () => { tabs[cur].el.innerHTML = ''; inp.focus(); };
    $('#btnReset').onclick = () => { if (confirm('Reset the simulated environment? All instances, databases and files are erased (your progress is kept).')) { newSim(); } };
    $('#btnDock').onclick = () => $('#dock').classList.toggle('big');
  }

  /* ---------- progress ---------- */
  const modTotal = (m) => m.lessons.length + m.labs.length + 1;
  const modDone = (m) => m.lessons.filter((l) => P.lessons[m.id + '.' + l.id]).length + m.labs.filter((l) => P.labs[m.id + '.' + l.id]).length + ((P.quiz[m.id] || 0) >= 70 ? 1 : 0);
  const modPct = (m) => Math.round(100 * modDone(m) / modTotal(m));
  const totalPct = () => { const t = C.modules.reduce((a, m) => a + modTotal(m), 0), d = C.modules.reduce((a, m) => a + modDone(m), 0); return Math.round(100 * d / t); };

  /* ---------- navigation ---------- */
  function drawMenu(route) {
    const mods = C.modules.map((m) => '<a data-r="m/' + m.n + '" class="' + (route === 'm/' + m.n ? 'on' : '') + '">' + m.icon + ' <span>' + m.n + '. ' + esc(m.title.split(':')[0].split('&')[0].trim()) + '</span><span class="pct">' + modPct(m) + '%</span></a>').join('');
    $('#menu').innerHTML = '<a data-r="home" class="' + (route === 'home' ? 'on' : '') + '">🏠 Home</a><div class="sec">Modules</div>' + mods +
      '<div class="sec">Practice</div>' + [['sandbox', '💻 Sandbox terminal'], ['exam', '📝 Final exam'], ['cheat', '📋 Cheat sheet']].map((x) => '<a data-r="' + x[0] + '" class="' + (route === x[0] ? 'on' : '') + '">' + x[1] + '</a>').join('') +
      '<div class="sec">More</div>' + [['roadmap', '🎓 Certification roadmap'], ['resources', '📚 Resources'], ['progress', '📊 My progress']].map((x) => '<a data-r="' + x[0] + '" class="' + (route === x[0] ? 'on' : '') + '">' + x[1] + '</a>').join('');
    $$('#menu a').forEach((a) => a.onclick = () => { location.hash = '#/' + a.dataset.r; $('#nav').classList.remove('open'); });
    $('#sidefoot').innerHTML = 'Overall progress: <b>' + totalPct() + '%</b><div class="bar"><i style="width:' + totalPct() + '%"></i></div>';
  }
  function route() {
    const h = (location.hash || '#/home').slice(2).split('/'); const r = h[0] === 'm' ? 'm/' + h[1] : h[0]; curLab = null;
    drawMenu(r); const v = $('#view'); v.scrollTop = 0;
    ({ home: vHome, sandbox: vSandbox, exam: vExam, cheat: vCheat, roadmap: vRoadmap, resources: vResources, progress: vProgress }[h[0]] || (h[0] === 'm' ? () => vModule(+h[1], h[2] || 'lessons') : vHome))(v);
  }

  /* ---------- views ---------- */
  function vHome(v) {
    v.innerHTML = '<h1>IBM Db2 DBA – interactive course</h1><p>Twelve modules from architecture to HADR. Read the lesson, run the commands in the built-in <b>Db2 simulator</b> below, finish the hands-on lab (checks tick automatically) and pass the quiz.</p>' +
      '<div class="callout warn"><b>Important:</b> the terminal is a <i>simulator</i> built for learning – commands, outputs and error codes follow Db2 LUW closely but are not guaranteed identical. Use it with IBM’s documentation and, for production skills, repeat the labs on a real Db2 (see docs/INSTALL.md).</div>' +
      '<div class="card"><b>Overall progress ' + totalPct() + '%</b><div class="bar"><i style="width:' + totalPct() + '%"></i></div></div><div class="grid">' +
      C.modules.map((m) => '<div class="card mod" data-r="m/' + m.n + '"><div class="ic">' + m.icon + '</div><h3>Module ' + m.n + ' – ' + esc(m.title) + '</h3><p style="color:var(--mut)">' + esc(m.summary) + '</p><span class="badge">~' + m.minutes + ' min</span> <span class="badge">' + m.labs.length + ' lab' + (m.labs.length > 1 ? 's' : '') + '</span><div class="bar"><i style="width:' + modPct(m) + '%"></i></div></div>').join('') + '</div>';
    $$('.mod', v).forEach((c) => c.onclick = () => location.hash = '#/' + c.dataset.r);
  }
  function wireCode(root) {
    $$('pre.code', root).forEach((p) => { if (p.dataset.w) return; p.dataset.w = 1; const txt = p.textContent; p.insertAdjacentHTML('afterbegin', '<div class="run"><span data-a="run">▶ Run</span><span data-a="copy">Copy</span></div>'); p.title = 'Click to run in the terminal';
      p.onclick = (e) => { const a = e.target.dataset && e.target.dataset.a; if (a === 'copy') { navigator.clipboard && navigator.clipboard.writeText(txt); toast('Copied'); } else { runText(txt, cur); } }; });
  }
  function vModule(n, tab) {
    const m = C.modules.find((x) => x.n === n); if (!m) return vHome($('#view'));
    const v = $('#view'); const T = [['lessons', '📖 Lessons'], ['labs', '🧪 Labs'], ['quiz', '❓ Quiz'], ['res', '📚 Resources']];
    v.innerHTML = '<span class="badge">Module ' + m.n + ' · ~' + m.minutes + ' min</span><h1>' + m.icon + ' ' + esc(m.title) + '</h1><p>' + esc(m.summary) + '</p><div class="card"><b>You will be able to:</b><ul>' + m.objectives.map((o) => '<li>' + esc(o) + '</li>').join('') + '</ul></div>' +
      '<div class="tabs">' + T.map((t) => '<button data-t="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>').join('') + '</div><div id="tabbody"></div>';
    $$('.tabs button', v).forEach((b) => b.onclick = () => { location.hash = '#/m/' + n + '/' + b.dataset.t; });
    const body = $('#tabbody');
    if (tab === 'lessons') {
      body.innerHTML = m.lessons.map((l, i) => { const k = m.id + '.' + l.id; return '<div class="card"><h2>' + (i + 1) + '. ' + esc(l.title) + '</h2>' + l.html + '<p><button class="b ' + (P.lessons[k] ? 'alt' : '') + '" data-k="' + k + '">' + (P.lessons[k] ? '✔ Completed' : 'Mark lesson complete') + '</button></p></div>'; }).join('');
      $$('button[data-k]', body).forEach((b) => b.onclick = () => { P.lessons[b.dataset.k] = !P.lessons[b.dataset.k]; saveP(); drawMenu('m/' + n); b.className = 'b ' + (P.lessons[b.dataset.k] ? 'alt' : ''); b.textContent = P.lessons[b.dataset.k] ? '✔ Completed' : 'Mark lesson complete'; });
      wireCode(body);
    } else if (tab === 'labs') vLabs(m, body); else if (tab === 'quiz') vQuiz(m, body); else body.innerHTML = '<div class="card">' + resList(m.resources) + '</div>';
  }
  const resList = (rs) => '<ul>' + rs.filter(Boolean).map((r) => '<li><a href="' + r.url + '" target="_blank" rel="noopener"><b>' + esc(r.title) + '</b></a> – ' + esc(r.note) + '</li>').join('') + '</ul>';

  /* ---------- labs ---------- */
  function vLabs(m, body) {
    body.innerHTML = m.labs.map((l) => '<div class="card" id="lab-' + l.id + '"><h2>' + esc(l.title) + ' <span class="badge">' + l.level + '</span> <span class="badge">' + l.terminals + ' terminal' + (l.terminals > 1 ? 's' : '') + '</span> <span class="badge" id="st-' + l.id + '">' + (P.labs[m.id + '.' + l.id] ? '✔ completed' : 'not completed') + '</span></h2><p><b>Goal:</b> ' + esc(l.goal) + '</p>' +
      '<p><button class="b" data-a="start" data-l="' + l.id + '">▶ Start / reset this lab</button> <button class="b alt" data-a="hint" data-l="' + l.id + '">💡 Hint</button> <button class="b alt" data-a="sol" data-l="' + l.id + '">Show solution</button></p>' +
      '<div class="callout tip" style="display:none" id="hint-' + l.id + '">' + l.hints.map(esc).join('<br>') + '</div><div id="sol-' + l.id + '"></div>' +
      l.steps.map((s, i) => '<div class="step"><div class="n">' + (i + 1) + '</div><div style="flex:1">' + s.t + '<pre class="code">' + esc(s.cmd) + '</pre></div></div>').join('') +
      '<h4>Checks (update live as you work)</h4><ul class="chk" id="chk-' + l.id + '">' + l.checks.map((c, i) => '<li data-i="' + i + '">' + esc(c.d) + '</li>').join('') + '</ul></div>').join('');
    wireCode(body);
    $$('button[data-a]', body).forEach((b) => b.onclick = () => {
      const l = m.labs.find((x) => x.id === b.dataset.l), a = b.dataset.a;
      if (a === 'start') startLab(m, l); else if (a === 'hint') { const h = $('#hint-' + l.id); h.style.display = h.style.display === 'none' ? 'block' : 'none'; }
      else { const el = $('#sol-' + l.id); el.innerHTML = '<div class="callout"><b>Solution</b> (try the steps first!)<pre class="code">' + esc(l.solution.map((c) => typeof c === 'string' ? c : (c.t ? '[T' + (c.t + 1) + '] ' : '') + c.cmd).join('\n')) + '</pre><button class="b alt" data-a="runsol">Run the whole solution for me</button></div>'; $('[data-a=runsol]', el).onclick = () => { startLab(m, l, true); runSolution(l); }; }
    });
    if (curLab) evalChecks();
  }
  function startLab(m, l, quiet) {
    newSim(); curLab = l; curLabMod = m; $$('#view .chk').forEach((u) => $$('li', u).forEach((li) => li.classList.remove('ok')));
    $('#dock').classList.remove('big'); l.setup.forEach((c) => exec(c, 0)); print(0, '<span class="sys">— Lab environment ready. Follow the steps. —</span>\n'); showTab(0); evalChecks();
    if (!quiet) toast('Lab environment ready – use the terminal below');
  }
  function runSolution(l) {
    const caps = {};
    l.solution.forEach((c) => { let t = 0, cap; if (typeof c === 'object') { t = c.t || 0; cap = c.cap; c = c.cmd; } c = c.replace(/\$\{(\w+)\}/g, (_, k) => caps[k]); const out = exec(c, t); if (cap) { const mm = String(out).match(/\d{4}-\d{2}-\d{2}-\d{2}\.\d{2}\.\d{2}/); caps[cap] = mm ? mm[0] : ''; } skew += 3000; });
  }
  function evalChecks() {
    if (!curLab) return; const S = C.S(sim); let all = true;
    curLab.checks.forEach((c, i) => { let ok = false; try { ok = !!c.f(S); } catch (e) {} const li = $('#chk-' + curLab.id + ' li[data-i="' + i + '"]'); if (li) li.classList.toggle('ok', ok); if (!ok) all = false; });
    const k = curLabMod.id + '.' + curLab.id;
    if (all && !P.labs[k]) { P.labs[k] = true; saveP(); toast('🎉 Lab completed: ' + curLab.title); const st = $('#st-' + curLab.id); if (st) st.textContent = '✔ completed'; drawMenu('m/' + curLabMod.n); }
  }

  /* ---------- quiz & exam ---------- */
  function renderQuestions(box, qs, onDone) {
    let answered = 0, right = 0; const res = [];
    box.innerHTML = qs.map((q, i) => '<div class="q card" data-i="' + i + '"><b>' + (i + 1) + '. ' + esc(q.q) + '</b>' + q.o.map((o, j) => '<button class="opt" data-j="' + j + '">' + esc(o) + '</button>').join('') + '<div class="why"></div></div>').join('');
    $$('.q', box).forEach((qe) => { const q = qs[+qe.dataset.i]; $$('.opt', qe).forEach((b) => b.onclick = () => { if (qe.dataset.done) return; qe.dataset.done = 1; const j = +b.dataset.j; answered++; const good = j === q.a; if (good) right++; res.push({ q, good }); b.classList.add(good ? 'good' : 'wrong'); $$('.opt', qe)[q.a].classList.add('good'); $('.why', qe).innerHTML = '<div class="callout ' + (good ? 'tip' : 'warn') + '">' + (good ? '✔ Correct. ' : '✘ Not quite. ') + esc(q.why) + '</div>'; if (answered === qs.length) onDone(right, res); }); });
  }
  function vQuiz(m, body) {
    body.innerHTML = '<p>Answer all ' + m.quiz.length + ' questions. Best score: <b>' + (P.quiz[m.id] == null ? '–' : P.quiz[m.id] + '%') + '</b> (70% completes the quiz).</p><div id="qs"></div><div id="qres"></div>';
    renderQuestions($('#qs'), m.quiz, (r) => { const pct = Math.round(100 * r / m.quiz.length); if (pct > (P.quiz[m.id] || 0)) P.quiz[m.id] = pct; saveP(); drawMenu('m/' + m.n); $('#qres').innerHTML = '<div class="card"><h2>Score: ' + r + ' / ' + m.quiz.length + ' (' + pct + '%)</h2>' + (pct >= 70 ? '✅ Passed.' : 'Review the lessons and <a href="#/m/' + m.n + '/quiz" onclick="location.reload()">try again</a>.') + '</div>'; });
  }
  function vExam(v) {
    v.innerHTML = '<h1>📝 Final exam</h1><div class="card"><p>40 random questions drawn from all modules. Pass mark <b>70%</b>. Best: <b>' + (P.exam.best || 0) + '%</b> · Attempts: ' + P.exam.attempts + '</p><button class="b" id="go">Start exam</button></div><div id="ex"></div>';
    $('#go').onclick = () => {
      let all = []; C.modules.forEach((m) => m.quiz.forEach((q) => all.push(Object.assign({ m: m.n }, q)))); all.sort(() => Math.random() - .5); all = all.slice(0, 40).map((q) => { const idx = q.o.map((_, i) => i).sort(() => Math.random() - .5); return Object.assign({}, q, { o: idx.map((i) => q.o[i]), a: idx.indexOf(q.a) }); });
      $('#go').disabled = true;
      renderQuestions($('#ex'), all, (r, res) => { const pct = Math.round(100 * r / all.length); P.exam.attempts++; P.exam.best = Math.max(P.exam.best || 0, pct); saveP(); const wk = {}; res.forEach((x) => { if (!x.good) wk[x.q.m] = (wk[x.q.m] || 0) + 1; });
        $('#ex').insertAdjacentHTML('afterbegin', '<div class="card"><h2>' + (pct >= 70 ? '🎓 Passed' : 'Not yet') + ' – ' + r + '/' + all.length + ' (' + pct + '%)</h2>' + (Object.keys(wk).length ? 'Review: ' + Object.keys(wk).map((k) => '<a href="#/m/' + k + '/lessons">Module ' + k + '</a> (' + wk[k] + ' missed)').join(', ') : 'Perfect score!') + '</div>'); scrollTo(0, 0); $('#view').scrollTop = 0; drawMenu('exam'); });
    };
  }

  /* ---------- other views ---------- */
  function vSandbox(v) { v.innerHTML = '<h1>💻 Sandbox</h1><p>A free practice environment: nothing is graded. Use the terminal at the bottom (Terminal 2 simulates a second application). Try:</p><pre class="code">db2start\ndb2 create database sample\ndb2 connect to sample\ndb2 "create table t (id int, name varchar(20))"\ndb2 "insert into t values (1, \'Ada\')"\ndb2 "select * from t"</pre><p>Type <code>help</code> for the command list. <b>⟲ Reset environment</b> wipes everything.</p>'; wireCode(v); $('#dock').classList.add('big'); }
  function vCheat(v) { v.innerHTML = '<h1>📋 Command cheat sheet</h1>' + C.cheat.map((s) => '<div class="card"><h3>' + s[0] + '</h3><table>' + s[1].map((r) => '<tr><td><code>' + esc(r[0]) + '</code></td><td>' + esc(r[1]) + '</td></tr>').join('') + '</table></div>').join(''); }
  function vRoadmap(v) { v.innerHTML = '<h1>🎓 Learning &amp; certification roadmap</h1>' + C.roadmap.map((r) => '<div class="card"><h3>' + esc(r.t) + '</h3><p>' + esc(r.d) + '</p></div>').join('') + '<div class="card">' + resList([C.res.training, C.res.docs, C.res.community, C.res.redbooks, C.res.db2]) + '</div>'; }
  function vResources(v) { v.innerHTML = '<h1>📚 Resources</h1><div class="card"><h3>Essentials</h3>' + resList(Object.values(C.res)) + '</div>' + C.modules.map((m) => '<div class="card"><h3>' + m.icon + ' Module ' + m.n + '</h3>' + resList(m.resources) + '</div>').join(''); }
  function vProgress(v) {
    v.innerHTML = '<h1>📊 My progress</h1><div class="card"><h2>' + totalPct() + '% complete</h2><table><tr><th>Module</th><th>Lessons</th><th>Labs</th><th>Quiz</th></tr>' + C.modules.map((m) => '<tr><td>' + m.n + '. ' + esc(m.title) + '</td><td>' + m.lessons.filter((l) => P.lessons[m.id + '.' + l.id]).length + '/' + m.lessons.length + '</td><td>' + m.labs.filter((l) => P.labs[m.id + '.' + l.id]).length + '/' + m.labs.length + '</td><td>' + (P.quiz[m.id] == null ? '–' : P.quiz[m.id] + '%') + '</td></tr>').join('') + '</table>Exam best: ' + (P.exam.best || 0) + '%</div>' +
      '<div class="card"><button class="b alt" id="ex">⬇ Export progress</button> <label class="b alt" style="display:inline-block">⬆ Import<input id="im" type="file" accept=".json" hidden></label> <button class="b alt" id="rs">Reset progress</button></div>';
    $('#ex').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(P, null, 2)], { type: 'application/json' })); a.download = 'db2-academy-progress.json'; a.click(); };
    $('#im').onchange = (e) => { const f = e.target.files[0]; if (!f) return; f.text().then((t) => { try { P = Object.assign(loadP(), JSON.parse(t)); saveP(); route(); toast('Progress imported'); } catch (x) { alert('Invalid file'); } }); };
    $('#rs').onclick = () => { if (confirm('Erase all progress?')) { P = { lessons: {}, labs: {}, quiz: {}, exam: { best: 0, attempts: 0 } }; saveP(); route(); } };
  }

  /* ---------- boot ---------- */
  function b64bytes(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  window.initSqlJs({ wasmBinary: b64bytes(window.SQL_WASM_B64).buffer }).then((S) => {
    SQL = S; P = loadP(); initInput(); newSim(); window.addEventListener('hashchange', route); route(); $('#boot').remove();
  }).catch((e) => { $('#boot').textContent = 'Failed to start the simulator: ' + e.message; });
  window.__academy = { get sim() { return sim; }, exec, startLab };
})();
