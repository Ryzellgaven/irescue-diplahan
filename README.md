# LDRRMO Diplahan Emergency Response System

React + Vite frontend backed by a PHP session API and MySQL-compatible database. The frontend and API can be deployed to PHP-capable web hosting, with the database hosted by a managed database provider. XAMPP is not required in production.

The shared backend supports resident registration and emergency reporting, staff operations and assignments, evacuation centers, IoT devices/readings, notifications, caller logs, audit records, system configuration, analytics, and role-gated administration.

## Requirements

- Node.js 20+ and npm 10+ (or pnpm) to build the frontend
- PHP 8.1+ with PDO MySQL, Fileinfo, and mbstring on the API host
- A persistent MySQL-compatible managed database

## Deploy on Render

This repository includes a Docker image and Render Blueprint for a single-origin deployment: Apache serves the built React app and PHP API together. Render does **not** provide a managed MySQL database, so create a persistent MySQL-compatible database with a separate provider before deploying. Do not select Render PostgreSQL; this API uses MySQL-specific PDO and schema.

1. Create a persistent MySQL database and a restricted application user with a provider that accepts connections from Render. Allow the connection from Render as directed by that provider, and enable TLS if offered.
2. Select the application database in the provider's SQL console/phpMyAdmin and import `backend/database.sql`.
3. In Render, choose **New → Blueprint**, select this GitHub repository, and apply `render.yaml`. The Blueprint creates the Docker web service and a persistent disk for PHP sessions and private report photos. The disk requires a paid Render web service.
4. In the new service's **Environment** settings, enter `LDRRMO_DB_HOST`, `LDRRMO_DB_PORT`, `LDRRMO_DB_NAME`, `LDRRMO_DB_USER`, and `LDRRMO_DB_PASSWORD` from the MySQL provider. If the provider requires a CA file for TLS, add it as a Render secret file and set `LDRRMO_DB_SSL_CA` to that file's path. Never put database credentials in `VITE_` variables.
5. Wait for `/healthz.php` to report healthy, then open the Render service URL. The frontend is built with `VITE_API_URL=/api/index.php`; the frontend and API share HTTPS origin, so no CORS allowlist is needed.
6. In the Render service's **Shell**, provision the first administrator using the instructions in [Render deployment](backend/SETUP.md). No default account exists.

Use the database provider's persistent storage, automated backups, and monitoring for continuous availability. Render's persistent disk preserves uploads and PHP sessions across deploys, but is not a substitute for database backups or a highly available database plan.

## Local development

Run the frontend with `pnpm install` and `pnpm dev`. Point `VITE_API_URL` at a running PHP API. The project no longer assumes XAMPP or a localhost API, and it does not provide a mock backend.

## Backend and security

The PHP API uses server-side PHP sessions, CSRF validation for mutations, prepared statements, server-side role checks, login throttling, password hashing, audit logging, and private authenticated media delivery. IoT readings are accepted only with a registered device's secret token; no simulated readings are produced. Browser polling replaces database realtime subscriptions.

Notification dispatch is persisted. In-app notifications are delivered from the database. Push, SMS, and email remain marked failed with a clear provider-not-configured message until real delivery providers are configured; the interface does not claim to have sent them.

The `/operations` route provides the operations portal using the same API and database.
