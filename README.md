# Db2 DBA Academy

An interactive course that teaches **IBM Db2 (LUW) database administration** – lessons, explanations, hands-on labs and quizzes – with a built-in **Db2 command-line simulator** so you can do all the training inside the app. No Db2 install is needed to learn.

* 12 modules: architecture, instances & configuration, databases, storage, tables & indexes, data movement, security, logging & backup, restore & rollforward, locking, monitoring/tuning, HADR & troubleshooting
* 35 lessons, 16 graded labs (checks tick live), 72 quiz questions, a 40-question final exam (pass 70 %)
* Two terminals (for locking and HADR labs), sandbox mode, cheat sheet, certification roadmap, curated IBM resources
* Progress saved in your browser; export/import as JSON

## Quick start
1. Install **Node.js 18+** (only for the tiny local web server).
2. `node server.js` (or `./start.sh`, `start.bat` on Windows) → open <http://127.0.0.1:4600>
3. No Node? Just open `public/index.html` in a modern browser – it works offline from the file system.

Details: [docs/INSTALL.md](docs/INSTALL.md) · How to learn with it: [docs/USER_GUIDE.md](docs/USER_GUIDE.md) · [Curriculum](docs/CURRICULUM.md) · [Cheat sheet](docs/CHEATSHEET.md) · [Real Db2 workbook](docs/REAL_DB2_WORKBOOK.md)

## ⚠ What the simulator is – and is not
The terminal is **not IBM Db2**. It is a JavaScript model (SQL runs on SQLite compiled to WebAssembly; the DBA layer – CLP, instances, configuration, table spaces, logging, backup/restore/rollforward, locks, HADR – is simulated). Commands, outputs and most error codes follow Db2 LUW 11.5/12.1 closely, but some message texts/codes are approximations, many options are not implemented, and performance behaviour (buffer pools, plans, timerons) is illustrative. See *Limitations* in the user guide. Always confirm against the IBM documentation, and finish with real Db2 (Community Edition is free) before touching production.

## Development
`npm install` (only needed for tests) · `npm test` runs every lab's reference solution headlessly and checks quiz data · `npm run docs` regenerates the generated docs. Layout: `public/js/sim*.js` (simulator), `public/js/course/` (content), `public/js/app.js` (UI).

Not affiliated with or endorsed by IBM. IBM and Db2 are trademarks of IBM Corp. sql.js is MIT-licensed (bundled in `public/vendor`).
