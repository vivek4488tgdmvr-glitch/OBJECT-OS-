# ObjectOS developer setup

## Requirements
- Node.js 20.19+ or 22.12+
- Docker Desktop (for PostgreSQL), or an existing PostgreSQL 16 database
- npm

## Start the database
From the project root:

    docker compose up -d db

## Configure the API
Copy `server/.env.example` to `server/.env` and confirm `DATABASE_URL`.
Copy `.env.example` to `.env` for the Vite client.

The root package uses dotenv for the API. Run the API from the project root, so dotenv can read a root `.env` file, or export the variables from `server/.env` in your shell. For a simple local setup, copy `server/.env.example` to the root `.env` and add `VITE_API_URL=http://localhost:4000/api`.

## Install and prepare
    npm install
    npm run db:generate
    npm run db:migrate

When Prisma asks for a migration name, use `init`.

## Run
Open two terminals in the project root:

    npm run server

    npm run dev

Open http://localhost:5173.

## Backend account API
The backend exposes:
- `POST /api/auth/register` — email, password (minimum 12 characters), optional householdName
- `POST /api/auth/login` — email and password
- `POST /api/auth/logout` — bearer token
- `GET /api/objects` — authenticated object list
- `POST /api/objects` — create object
- `PUT /api/objects/:id` — update object
- `DELETE /api/objects/:id` — delete object
- `GET /api/health` — API health check

Authentication endpoints return an opaque random bearer token. The server stores only its SHA-256 hash and expires sessions after 30 days.

## Current implementation boundaries
- Object CRUD, search, camera capture, QR label generation/scanning, CSV import/export, local IndexedDB storage, and password-encrypted backup/restore are implemented in the client.
- The UI supports account registration/sign-in and can reconcile the local inventory with the authenticated API when online. Changes are stored locally with a durable outbox and retried when sync is invoked or connectivity returns. Conflict handling currently uses a simple timestamp-based local/remote reconciliation; it is not a collaborative conflict-resolution system and has no remote deletion tombstones yet. Test multi-device behavior before production use.
- The server stores an optional image data URL in the record for the initial implementation. For production, move photos and documents to private object storage and store file keys in PostgreSQL.
- The encrypted `.oob` backup protects the downloaded backup file. It does not mean normal synced database records or attachments are end-to-end encrypted.
- The starter stores a small photo as a data URL in IndexedDB. Large libraries should use IndexedDB Blobs and private object storage instead.
- Do not use the starter API with real sensitive data until you have configured HTTPS, database backups, deployment secrets, monitoring, and production-grade rate limiting. The in-memory auth throttle is per-process only.
- Camera QR scanning requires a secure context (HTTPS or localhost) and user permission.
- Fire TV compatibility must be tested on the target device or simulator. The responsive web app is not a substitute for an actual Fire TV app, remote-navigation tests, or platform certification testing.
