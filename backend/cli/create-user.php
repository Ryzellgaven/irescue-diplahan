<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

if ($argc !== 4) {
    fwrite(STDERR, "Usage: php create-user.php <email> <full-name> <ldrrmo_staff|supervisor|admin>\n");
    exit(2);
}

$email = strtolower(trim($argv[1]));
$name = trim($argv[2]);
$role = $argv[3];
$password = getenv('LDRRMO_NEW_USER_PASSWORD');
$adminLock = false;

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $name === '' || strlen($name) > 120) {
    fwrite(STDERR, "A valid email and a name of 1 to 120 characters are required.\n");
    exit(2);
}
if (!in_array($role, ['ldrrmo_staff', 'supervisor', 'admin'], true)) {
    fwrite(STDERR, "Role must be ldrrmo_staff, supervisor, or admin.\n");
    exit(2);
}
if (!is_string($password) || strlen($password) < 12 || strlen($password) > 72) {
    fwrite(STDERR, "Set LDRRMO_NEW_USER_PASSWORD to a password of 12 to 72 bytes before running this script.\n");
    exit(2);
}

try {
    $pdo = database();
    if ($role === 'admin') {
        $lock = $pdo->query("SELECT GET_LOCK('ldrrmo-first-admin', 10)")->fetchColumn();
        if ((int)$lock !== 1) {
            fwrite(STDERR, "Could not safely acquire the first-administrator provisioning lock.\n");
            exit(1);
        }
        $adminLock = true;
        $admins = (int)$pdo->query("SELECT COUNT(*) FROM profiles WHERE role = 'admin'")->fetchColumn();
        if ($admins > 0) {
            fwrite(STDERR, "An administrator already exists. Create additional administrators while signed in as an administrator.\n");
            exit(1);
        }
    }
    $insert = $pdo->prepare(
        'INSERT INTO profiles (email, full_name, password_hash, role) VALUES (?, ?, ?, ?)'
    );
    $insert->execute([$email, $name, password_hash($password, PASSWORD_DEFAULT), $role]);
    fwrite(STDOUT, "Created {$role} account for {$email}.\n");
    if ($adminLock) {
        $pdo->query("SELECT RELEASE_LOCK('ldrrmo-first-admin')");
        $adminLock = false;
    }
} catch (PDOException $error) {
    if ($error->getCode() === '23000') {
        fwrite(STDERR, "An account with that email already exists.\n");
        exit(1);
    }
    fwrite(STDERR, "Could not create account. Check the MySQL connection and PHP error log.\n");
    error_log('[LDRRMO user provisioning] ' . $error->getMessage());
    exit(1);
} finally {
    if ($adminLock && isset($pdo)) {
        $pdo->query("SELECT RELEASE_LOCK('ldrrmo-first-admin')");
    }
    putenv('LDRRMO_NEW_USER_PASSWORD');
}
