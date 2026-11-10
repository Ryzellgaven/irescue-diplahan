# Backend deployment

The application backend is a PHP API connected to a MySQL-compatible database. Deploy the API and database on managed hosting; neither XAMPP nor a developer's computer needs to stay running.

## 1. Create and initialize the database

Create a persistent database and a restricted application user with your database provider. In the provider console, select the newly created database and import `database.sql`. The schema file does not create or select a database, so it works with managed providers that restrict those operations.

For an existing installation created by the former standalone `/xampp` portal, back up `ldrrmo_xampp` first. The legacy `migrate-existing-xampp-stage1.sql` and `migrate-existing-xampp-stage2.sql` scripts are only for that migration and expect the original database name. For an existing unified database, select that database in your SQL client and run `migrate-safe-routes.sql`.

## 2. Deploy the PHP API

Deploy the contents of `backend/api` to a PHP 8.1+ web host with PDO MySQL, Fileinfo, and mbstring enabled. Set these server-side environment variables using the hosting control panel:

- `LDRRMO_DB_HOST`
- `LDRRMO_DB_PORT`
- `LDRRMO_DB_NAME`
- `LDRRMO_DB_USER`
- `LDRRMO_DB_PASSWORD`

The API fails explicitly if database configuration is missing. Do not use a privileged database account or expose the database directly to the public internet.

For a frontend hosted on a different origin, set `LDRRMO_ALLOWED_ORIGINS` to the exact comma-separated HTTPS origin(s), without a trailing slash. Do not use `*` with session cookies. For a same-origin frontend/API deployment, the variable can remain unset.

Set `LDRRMO_PRIVATE_UPLOAD_DIR` to an existing writable, persistent directory outside the public web root. This is required for report photos to survive deploys or server restarts. The API accepts JPEG, PNG, WebP, or GIF files up to 5 MB; configure PHP's `upload_max_filesize` and `post_max_size` to at least 6 MB.

## 3. Deploy the frontend

Set `VITE_API_URL` at build time to the API entry point, such as `https://api.example.gov.ph/index.php`. If the API is available at `/api/index.php` on the same origin, the default is already configured. These `VITE_` values are public frontend configuration; never put secrets in them.

Build with `npm run build` and publish `dist` to a static web host. Configure SPA fallback/rewrite rules so application routes resolve to `index.html`. Use HTTPS for both the frontend and API.

## 4. Provision the first administrator

Run `backend/cli/create-user.php` through the PHP CLI on the API host (or a trusted deployment job) after configuring the same database environment variables. No default password/account exists. Provide a private password through `LDRRMO_NEW_USER_PASSWORD`, then remove it immediately after the command. Example for PowerShell:

```powershell
$securePassword = Read-Host "Enter an administrator password (12 to 72 bytes)" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $env:LDRRMO_NEW_USER_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    php ".\backend\cli\create-user.php" "admin@diplahan.gov.ph" "System Administrator" "admin"
} finally {
    Remove-Item Env:LDRRMO_NEW_USER_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
```

CLI provisioning permits the initial admin only while there is no administrator. It takes a MySQL advisory lock to prevent concurrent first-admin creation. Once the first admin exists, add further users, staff, or administrators through the server-authorized User Management page. Resident self-registration creates only the `resident` role.

## Operations

- Operational records are persisted in the configured shared database.
- Staff routes and admin operations are authorized by the PHP API on every request.
- The app polls the API periodically for updates.
- Sensor values must come from an actual registered sensor or trusted gateway. Keep device tokens out of browser code and source control.
- In-app notifications are delivered from the database. Push/SMS/email require real delivery providers.
- Configure automated database backups and monitor database/API availability with the hosting provider. Availability depends on those services and their plan; application code alone cannot guarantee 24/7 uptime.
