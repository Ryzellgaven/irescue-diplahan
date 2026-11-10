# LDRRMO Diplahan Emergency Response System

React + Vite frontend backed by a PHP session API and MySQL-compatible database. The frontend and API can be deployed to PHP-capable web hosting, with the database hosted by a managed database provider. XAMPP is not required in production.

The shared backend supports resident registration and emergency reporting, staff operations and assignments, evacuation centers, IoT devices/readings, notifications, caller logs, audit records, system configuration, analytics, and role-gated administration.

## Requirements

- Node.js 20+ and npm 10+ (or pnpm) to build the frontend
- PHP 8.1+ with PDO MySQL, Fileinfo, and mbstring on the API host
- A persistent MySQL-compatible managed database

## Deploy

1. Create a database and restricted database user with your hosting provider. Keep the database private and allow connections only from the API host.
2. Select that database in your provider's SQL console/phpMyAdmin and import `backend/database.sql`.
3. Deploy the contents of `backend/api` to a PHP-enabled host. Set `LDRRMO_DB_HOST`, `LDRRMO_DB_PORT`, `LDRRMO_DB_NAME`, `LDRRMO_DB_USER`, and `LDRRMO_DB_PASSWORD` as server-side environment variables. The API does not include local or default database credentials.
4. Configure `LDRRMO_PRIVATE_UPLOAD_DIR` as an existing writable, persistent directory outside the public web root. Set `LDRRMO_ALLOWED_ORIGINS` to the exact HTTPS frontend origin when frontend and API use different origins. For a same-origin API, it can remain unset.
5. Build and deploy the frontend. Set `VITE_API_URL` before building to the API entry point, for example `https://api.example.gov.ph/index.php`; if the API is served from the same origin at `/api/index.php`, the default works without this setting.
6. Configure PHP upload limits to at least 6 MB for report photos, then provision the first administrator using the procedure in [Backend deployment](backend/SETUP.md).

Use the hosting provider's persistent database service, automated backups, and monitoring for continuous availability; a frontend host alone does not provide a database or guarantee uptime. Never put database credentials in frontend environment variables or commit them to source control.

## Local development

Run the frontend with `npm install` and `npm run dev`. Point `VITE_API_URL` at a running PHP API. The project no longer assumes XAMPP or a localhost API, and it does not provide a mock backend.

## Backend and security

The PHP API uses server-side PHP sessions, CSRF validation for mutations, prepared statements, server-side role checks, login throttling, password hashing, audit logging, and private authenticated media delivery. IoT readings are accepted only with a registered device's secret token; no simulated readings are produced. Browser polling replaces database realtime subscriptions.

Notification dispatch is persisted. In-app notifications are delivered from the database. Push, SMS, and email remain marked failed with a clear provider-not-configured message until real delivery providers are configured; the interface does not claim to have sent them.

The `/operations` route provides the operations portal using the same API and database.
