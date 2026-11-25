// Generates docs/CURRICULUM.md, docs/CHEATSHEET.md, docs/REAL_DB2_WORKBOOK.md from the course data.
const path = require('path'), fs = require('fs'); const root = path.join(__dirname, '..');
global.window = undefined; require(root + '/public/js/course/core.js');
['m01-03', 'm04-06', 'm07-09', 'm10-12', 'extras'].forEach((f) => require(root + '/public/js/course/' + f + '.js'));
const C = global.COURSE; const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
let cur = '# Curriculum\n\n';
C.modules.forEach((m) => { cur += `## Module ${m.n} – ${m.title} (~${m.minutes} min)\n\n${m.summary}\n\n**Objectives**\n` + m.objectives.map((o) => '- ' + o).join('\n') + '\n\n**Lessons:** ' + m.lessons.map((l) => l.title).join('; ') + '\n\n**Labs:** ' + m.labs.map((l) => l.title).join('; ') + '\n\n**Quiz:** ' + m.quiz.length + ' questions\n\n'; });
fs.writeFileSync(root + '/docs/CURRICULUM.md', cur);
let ch = '# Command cheat sheet\n\n'; C.cheat.forEach((s) => { ch += `## ${s[0]}\n\n| Command | Purpose |\n|---|---|\n` + s[1].map((r) => `| \`${r[0]}\` | ${r[1]} |`).join('\n') + '\n\n'; });
fs.writeFileSync(root + '/docs/CHEATSHEET.md', ch);
let wb = '# Real Db2 workbook\n\nRepeat every lab on a real Db2 (see INSTALL.md). Commands are taken from the in-app labs. Differences to expect: real output wording/formatting, real paths (e.g. archive log directory layout), and **timings** (point-in-time labs need a real pause between steps). Simulator-only shortcuts: `useradd` creates a fake OS user, `ssh db2standby` switches to the simulated standby - on real systems use your OS tools and the real standby host. Where a lab says "terminal 2", open a second shell/session. Lab setup commands are listed first - run them as the instance owner (`db2inst1`).\n\n';
C.modules.forEach((m) => m.labs.forEach((l) => {
  wb += `## ${l.title}\n\n**Goal:** ${l.goal}\n\n**Setup**\n\`\`\`\n${l.setup.join('\n')}\n\`\`\`\n\n`;
  l.steps.forEach((s, i) => { wb += `${i + 1}. ${strip(s.t)}\n\n\`\`\`\n${s.cmd}\n\`\`\`\n\n`; });
  wb += '**Success criteria**\n' + l.checks.map((c) => '- [ ] ' + c.d).join('\n') + '\n\n';
}));
fs.writeFileSync(root + '/docs/REAL_DB2_WORKBOOK.md', wb); console.log('docs generated');
