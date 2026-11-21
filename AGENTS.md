# Orbit development contract

The app is a competition concept with fictional data. Keep the existing public Site and its D1 binding; do not create another Site or change the audience without the user's request.

## Before changing code

Read README.md, docs/CONTEST_CHECKLIST.md and the relevant API/UI files. Keep a bounded task and explicit file ownership when using assistants. Do not revert other contributors' edits.

## Commands

- `npm test`: meaningful API/security/persistence tests.
- `npm run typecheck`: TypeScript.
- `npm run db:generate`: append a schema migration.
- `npm run db:migrate`: apply pending local migrations.
- `npm run dev -- --port 5173`: local preview.
- `npm run build`: Cloudflare Worker build. Stop the built preview before rebuilding on Windows because it can hold dist files open.

## Security invariants

- Determine the student only from a server session on every protected operation.
- Scope reads and writes by that student, including object IDs, histories, exports and personal plan marks.
- Never put service secrets, password hashes or session tokens in client code or logs.
- Preserve Origin checks, safe cookies, no-store responses and server validation.
- Create request and history atomically. Concurrent retries must create one request and consume one quota slot.
- Public demo accounts are shared. Keep writes bounded and warn users to use fictional information only.
- Never replay or edit an already applied migration. Append a new migration.

## Verification and evidence

Verify changed flows at 360 px and desktop through the supported browser tool, plus API isolation and persistence. Do not claim Russia/no-VPN access, interviews, human work, uptime or checks without evidence. Keep real screenshots and record prompt -> change -> test in the process document.

## Documentation location

Canonical authored documents are in the user's Obsidian vault, `01 Projects/Цифровой деканат`. Local README/docs are hard links to the Codex notes on this workstation; a Git checkout contains regular Markdown copies. Update the canonical Codex note instead of creating versioned duplicates. Never delete vault content or edit .obsidian. Rebuild the user's canvas after creating notes. Scripts, source, tests and temporary files remain in the project/work directory.
