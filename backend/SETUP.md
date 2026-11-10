# Render deployment

The repository's `render.yaml` deploys a single Docker web service. Apache serves the compiled Vite frontend and PHP API from the same HTTPS origin. Render does not provide managed MySQL; create a persistent MySQL-compatible database with a separate provider first.

## 1. Prepare MySQL

Create a persistent MySQL database and restricted application user. Configure the provider to accept connections from Render and use TLS when available. Select the database in the provider's SQL console/phpMyAdmin and import `backend/database.sql`.

The schema intentionally does not create or select the database, so it can be imported with restricted provider privileges. Do not use Render PostgreSQL: this API uses MySQL PDO, MySQL schema features, and MySQL advisory locks.

## 2. Create the Render service

In Render, choose **New → Blueprint**, select this repository, and apply `render.yaml`. This builds the Docker image, exposes the app on Render's assigned port, and attaches a persistent disk at `/var/data` for report uploads and PHP sessions. Render persistent disks require a paid web service and are attached to a single instance.

In the service's **Environment** settings, set:

- `LDRRMO_DB_HOST`
- `LDRRMO_DB_PORT`
- `LDRRMO_DB_NAME`
- `LDRRMO_DB_USER`
- `LDRRMO_DB_PASSWORD`

For a TLS-required MySQL provider, add its CA certificate as a Render secret file and set `LDRRMO_DB_SSL_CA` to the file path. The API verifies that certificate when configured. Never add database credentials to frontend variables or Git.

Wait for the `/healthz.php` check to pass. It verifies database connectivity, so the service will not become healthy until all database settings are correct and the provider allows the connection. The Vite bundle calls `/api/index.php` on the same origin; no CORS configuration is needed.

## 3. Provision the first administrator

Open the deployed service's **Shell** in Render. Provide the password without putting it in the command history, then run the CLI provisioner:

```sh
read -s -p "Administrator password: " LDRRMO_NEW_USER_PASSWORD
export LDRRMO_NEW_USER_PASSWORD
printf '\n'
php /opt/ldrrmo/backend/cli/create-user.php "admin@diplahan.gov.ph" "System Administrator" "admin"
unset LDRRMO_NEW_USER_PASSWORD
```

Use a unique password 12 to 72 bytes long. No default administrator is included. Provisioning only creates the first admin when none exists; create later staff and administrators from User Management.

## Runtime and operations

- The service needs these PHP extensions: PDO MySQL, Fileinfo, and mbstring; the Dockerfile installs them.
- `LDRRMO_PRIVATE_UPLOAD_DIR` is set to `/var/data/report-uploads` and is on Render's persistent disk. PHP session files are also stored on that disk.
- PHP upload limits are set to 6 MB. The application rejects media larger than 5 MB.
- The API recognizes Render's forwarded HTTPS protocol so session cookies are marked `Secure`.
- `/healthz.php` returns healthy only when the MySQL database answers a query. Check the service logs and database network settings if it fails.
- Back up the database through the database provider. Render's application disk is not a database backup.
- A single Render instance avoids local PHP-session files diverging across instances. Do not scale this service horizontally without moving sessions to a shared session store.
- Render and the database provider's plan determine uptime and backup guarantees; application deployment alone does not guarantee 24/7 availability.

## Existing XAMPP migrations

For an existing installation created by the former standalone `/xampp` portal, back up `ldrrmo_xampp` first. The legacy `migrate-existing-xampp-stage1.sql` and `migrate-existing-xampp-stage2.sql` scripts expect that original database. For an existing unified database, select it in your SQL client and run `migrate-safe-routes.sql`.
