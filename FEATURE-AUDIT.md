# ObjectOS feature audit — 2026-10-23

This file distinguishes implemented code from work that still needs runtime or deployment verification. A feature is not considered production-ready merely because it appears in the UI.

## Implemented in this source update

- Exact approved Crimson Eclipse logo asset used by the app icon, sidebar/about mark, favicon, and PWA manifest.
- Local-first object create/edit/delete with IndexedDB transaction completion and input validation.
- Object status can be set to Active, Archived, or Lost.
- Search across name, description, category, room, location, container, serial number, and QR token.
- QR generation and browser camera scanning (requires HTTPS/localhost and camera permission).
- CSV import/export with quoting support, ID collision warning, duplicate ID rejection, and queued sync changes.
- Password-encrypted AES-GCM backup and restore.
- Restore preview/confirmation, duplicate-ID rejection, and a pre-restore encrypted snapshot before overwrite.
- Portability JSON export with SHA-256 corruption check, verification, and audit summary.
- Local Smart Insights for warranties, missing locations, possible duplicates, and stale records.
- Account registration/login/logout UI connected to bearer-token API endpoints.
- Durable local outbox, sequential retry behavior, sync on save/manual request/reconnection, and basic server/local reconciliation.
- API baseline headers, request-size limit, input validation, and in-memory auth attempt throttling.

## Added: Fire TV mode (src/tv/)

- TV home, room, box, item and search screens; remote-friendly spatial navigation; on-screen keyboard; demo household; auto-detect via user agent or `?tv=1`. Syntax-checked only; needs `npm install`, typecheck and on-device testing.

## Important limits — do not treat as production-ready yet

- Full production build and runtime browser tests could not be run in this environment because npm dependency installation timed out and packages were not available offline.
- Cloud sync is a first pass using timestamp-based reconciliation. It does not yet provide user-visible conflict resolution, server tombstones for remote deletions, or a formal optimistic-concurrency protocol. Test carefully with two devices before relying on it.
- Local records are not end-to-end encrypted on the server. The encrypted `.oob` export protects only the downloaded backup file.
- Documents, receipts, manuals, warranty attachment storage, and document OCR are not implemented as a complete document-management feature.
- Fire TV: a TV-specific web UI with D-pad navigation, on-screen keyboard and browse/search screens now exists (see FIRETV.md). It has NOT been run on physical Fire TV hardware, is not a native app, and has not been through store certification. The TV screen reads local IndexedDB only (no sign-in/sync on TV yet).
- No household invitations, role management, account recovery, MFA, or account deletion flow.
- The auth rate limiter is in-memory and per API process. Production requires edge rate limiting, HTTPS, secure secret management, database backups, monitoring, and operational recovery drills.
- Cloud sync does not sync attachments/documents as independent objects; images are data URLs on the inventory record and have size limits.
- No automated end-to-end suite currently proves all UI controls and failure cases.

## Verification performed for this update

- TypeScript transpile/syntax checks passed for all TypeScript/TSX source files.
- Six existing CSV and portability unit tests passed when transpiled into a temporary Node test harness.
- PWA manifest and archive schema parsed as valid JSON.
- Full `tsc -b`, official `npm run test:unit`, production build, and live server tests remain unverified because npm dependencies could not be installed in this environment.
