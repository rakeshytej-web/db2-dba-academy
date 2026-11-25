# User guide

## How to learn
For each module: **Lessons** (read, run the code blocks with ▶ Run) → **Labs** (Start/reset lab, follow numbered steps, checks tick as you go) → **Quiz** (70 % to complete). Finish with the **Final exam**, then repeat the labs on real Db2 using the workbook.

## The terminal
* Docked at the bottom; ⇕ enlarges it, *Clear* clears, *⟲ Reset environment* wipes the simulated machine (progress is kept).
* Click any code block to run it; paste multi-line text to run several commands.
* ↑/↓ history, Tab completion, Ctrl+L clear. Type `help` for commands.
* Two tabs = two applications/sessions (needed for locking labs). `ssh db2standby` moves to the simulated HADR standby.
* Both `db2 <command>` and CLP-style `db2 "sql"` work; quote SQL that contains special characters.

## Labs
*Start / reset this lab* builds a fresh environment and runs the setup commands. *Hint* and *Show solution* are there when stuck; "Run the whole solution" replays the reference answer. A lab completes automatically when all checks are ticked. Checks look at the simulated state (e.g. that a backup exists), not at exact command text, so there is often more than one right way.

## Progress
Stored in the browser (localStorage). Export/import JSON on *My progress*. The simulated environment itself is not persisted – it resets on reload.

## Limitations (read this)
* It is a **learning simulator**, not Db2. Do not rely on exact output text or timings. Some error codes/messages are approximations.
* Not implemented: stored procedures, sequences, MQTs, multi-partition/pureScale, real storage containers, native encryption, audit facility, most monitor elements. Schemas are metadata only (table names are global in the simulator).
* Locking is simplified: table-level locks, one writer at a time; deadlocks are explained but not reproducible.
* HADR, backup/restore/rollforward are modelled logically (statement-log replay) – good for understanding the procedure, not for performance or edge-case behaviour.
* Point-in-time labs use the simulator clock; copy the timestamp that *your* `values current timestamp` prints.
* IBM changes versions and exam objectives; the resource links use IBM Docs search so they stay valid. Check IBM Training for current certification details.
