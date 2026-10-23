# ObjectOS long-term engineering roadmap

## Evolution milestone: portability and auditability

This milestone adds a user-triggered, readable JSON portability bundle from the local workspace. The bundle includes a format version, export timestamp, inventory records, queued local changes, and a basic validation/location/duplicate audit.

Security note: this bundle is intentionally unencrypted for interoperability. It may contain private household information, including saved image data. Use the password-protected `.oob` backup for encrypted exports and keep both files in a secure location.

## Remaining work before production

- Run full dependency installation, TypeScript build, and browser end-to-end tests in CI.
- Design and test cloud sync with authentication, per-user authorization, retry behavior, and deterministic conflict resolution.
- Add versioned database migrations and restore drills.
- Test large inventories, storage quota failures, corrupt imports, and cross-browser portability.
- Implement and test the Fire TV app and remote navigation separately from the responsive web UI.
- Define retention, privacy, account recovery, and export/deletion policies before storing household data on a server.

No software can be guaranteed to survive a fixed number of years without maintenance. The goal is to make data exportable, verifiable, recoverable, and migratable as platforms evolve.


## Evolution increment: long-term integrity

- Portability JSON exports now include a SHA-256 checksum over the exact serialized payload (before the integrity field). This helps detect accidental file corruption during copying or archival.
- The checksum is **not** a signature, authenticity proof, or encryption. Keep sensitive exports private and use the encrypted `.oob` backup for confidentiality.
- Follow-up work: add a dedicated import/verify workflow that recomputes the checksum before any data is changed, then add end-to-end restore tests.

## Evolution 80 — verified archive checks
- Added a read-only portability-bundle verifier that checks bundle format, required metadata, SHA-256 digest, and record list shape before reporting verification.
- Added a Smart Insights UI control to select and verify an archived JSON portability bundle. It never imports or changes local records.
- Added unit tests for valid checksums, payload tampering, malformed JSON, and unsupported formats.
- Integrity verification detects accidental corruption or changes relative to the embedded digest; it is not a digital signature and cannot establish who created the bundle.
- Build/test execution remains pending when dependencies are unavailable; run `npm install`, `npm run test:unit`, and `npm run build` in the project environment.
