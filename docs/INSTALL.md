# Installation

## A. The academy app (simulator) – 2 minutes
**Requirements:** a modern browser (Chrome, Edge, Firefox, Safari). Optional: Node.js 18+ for the local server.

| OS | Steps |
|---|---|
| Linux / macOS | unzip → `cd db2-dba-academy` → `./start.sh` (or `node server.js 4600`) → browse to `http://127.0.0.1:4600` |
| Windows | unzip → double-click `start.bat` (or run `node server.js` in a terminal) → open `http://127.0.0.1:4600` |
| No Node.js | open `public/index.html` directly in the browser (works offline, no server) |

* Different port: `node server.js 8080`. The server binds to 127.0.0.1 only (not reachable from the network).
* Progress lives in your browser's localStorage for that address. `file://` and `http://127.0.0.1:4600` are different storage areas – use *My progress → Export/Import* to move between them.
* Tests (optional): `npm install` then `npm test`.
* Troubleshooting: "port in use" → choose another port. Blank page → use a current browser (WebAssembly required). Progress missing → you opened a different address.

## B. Real Db2 for practice (recommended after the simulator labs)
Verify current requirements and licence terms on IBM's pages first (<https://www.ibm.com/products/db2>, IBM Docs). Options:

**1. Db2 Community Edition in Docker (easiest; free with resource limits)**
```
docker run -itd --name mydb2 --privileged=true -p 50000:50000 \
  -e LICENSE=accept -e DB2INST1_PASSWORD=ChangeMe123 -e DBNAME=testdb \
  -v db2data:/database icr.io/db2_community/db2
docker logs -f mydb2        # wait for "Setup has completed"
docker exec -ti mydb2 bash -c "su - db2inst1"
db2 connect to testdb
```
Docker Desktop (Windows/macOS) or Docker Engine (Linux); give the VM a few GB of RAM. Check IBM's Db2 Docker documentation for the current image tag, flags and limitations.

**2. Native install (Linux/Windows):** download Db2 Community Edition from IBM, run `db2prereqcheck`, then `db2_install`/`db2setup`, create an instance (`db2icrt`) and start it with `db2start`. Follow the IBM Docs installation chapter for your OS and version.

**3. Cloud:** IBM Db2 on Cloud free/lite plans (features are limited – no OS access, so backup/rollforward labs are not possible).

Then work through `docs/REAL_DB2_WORKBOOK.md` – the same labs as in the app.
