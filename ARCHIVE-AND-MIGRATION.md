# ObjectOS long-term archive and migration contract

ObjectOS cannot promise that any current application, cloud provider, file format, or device will exist decades from now. This contract is intended to make future recovery and migration practical.

## Archive rules

- Keep at least one export outside the device running ObjectOS.
- Keep multiple copies in separate physical or provider locations; periodically test restoring a copy.
- Treat exports as sensitive: inventory names, serial numbers, images, and household locations can reveal private information.
- The SHA-256 checksum in a portability bundle detects accidental corruption only when the checksum itself is trusted. It is not encryption and is not an authenticity signature.
- Preserve the original archive when migrating. Make a new copy and record the migration date and software version.

## Format evolution

- `format` is the stable format identifier: `objectos-portability-bundle`.
- `formatVersion` is an integer. Readers must reject unsupported versions rather than silently reinterpret them.
- Add optional fields where possible; do not change the meaning of an existing field in place.
- When a breaking change is necessary, implement an explicit version-to-version migration and keep fixtures for every supported version.
- Keep identifiers stable across migrations. Do not silently merge duplicate records.
- Validate a complete import before changing the live database; use a transaction or staged replacement where the storage backend supports it.

## Recovery drill

At least once every six months, export a bundle, copy it to a separate location, verify its checksum, import it into a clean test profile, and compare the record count and a sample of item details. Keep a dated note of the result. A backup that has never been restored is not a proven backup.

## Honest limits

Checksums do not prevent malicious replacement, and browser local storage can be cleared by the user, browser, or operating system. For important records, use independent copies. Cloud sync, account recovery, and cryptographic signatures require separately implemented and tested systems; this document does not claim they already exist.
