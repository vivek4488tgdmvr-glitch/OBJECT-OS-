# ObjectOS longevity plan

This is an engineering plan, not a promise that any software can run unchanged for ten years.

## Current update: reliability and portability

- Local-first IndexedDB persistence with transaction completion/error handling and version-change closure.
- Atomic batch restore/import and validation of object records before persistence.
- CSV parser/encoder that supports quoted commas, escaped quotes, and embedded line breaks.
- Encrypted backup input validation and bounded file sizes.
- Request persistent browser storage where the browser supports it; this is best-effort and never replaces backups.
- Keyboard shortcuts: Ctrl/Cmd+K for search, N to add an object, Escape to close dialogs.
- Unit tests for CSV round-tripping and malformed input.
- Preserve the approved Crimson Eclipse visual identity and exact uploaded logo asset.

## Required before production

1. Install dependencies in a clean environment and run `npm run typecheck`, `npm run test:unit`, and `npm run build`.
2. Add end-to-end browser tests for create/edit/delete, QR scanning, backup/restore, CSV import/export, offline mode, and mobile layouts.
3. Finish authenticated cloud sync with idempotency keys, server-side authorization per household, conflict resolution, retry/backoff, and a visible sync state. Do not treat a configured API URL as proof of sync.
4. Review the API security model, rate limits, validation, migrations, logging, secrets, and backup/restore drills before deployment.
5. Define a versioned, documented export format and periodically test restore on a clean install.

## Ten-year maintenance principles

- Keep data exportable without ObjectOS-specific infrastructure.
- Use versioned migrations and backward-compatible imports.
- Maintain automated tests, dependency updates, accessibility checks, and a security review process.
- Maintain at least two independent backups and periodically perform restore drills.
- Make cloud sync optional; users must be able to access and export local data.
- Keep operational procedures and architecture decisions in version control.

## Evolution 2: Local smart-insights layer
- Added a Smart Insights workspace that evaluates existing inventory locally.
- Surfaces warranties ending within 30 days and already-expired warranty dates.
- Flags records without any room/location/container, records not updated for 180 days, and possible duplicate names/serial numbers.
- Duplicate detection is advisory only; it never merges or deletes records automatically.
- Added responsive Crimson Eclipse styling for the insights workspace.
- Privacy note: these heuristics run in the browser and do not transmit inventory to an AI service.
- Validation status: source updated; automated build/test run was blocked because project dependencies are not installed in this environment (`tsx: not found`).

### Archive verification milestone
ObjectOS can now verify the SHA-256 checksum of a portability JSON bundle before a user relies on it. The verification is read-only and does not restore data. The checksum is not a signature and cannot prove authenticity. Automated tests cover valid data, modified payloads, malformed JSON, and unsupported formats; run the suite in an environment with project dependencies installed.

## Archive longevity milestone

- Added `archive-format.schema.json` as a machine-readable envelope contract for portability bundle v1.
- Added `ARCHIVE-AND-MIGRATION.md` with explicit backup, restore-drill, versioning, and migration rules.
- These documents improve future maintainability; they do not replace automated migrations, cloud sync, signed archives, or an end-to-end recovery test.
