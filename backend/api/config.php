<?php
declare(strict_types=1);

date_default_timezone_set('UTC');

function database(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = getenv('LDRRMO_DB_HOST');
    $port = getenv('LDRRMO_DB_PORT');
    $name = getenv('LDRRMO_DB_NAME');
    $user = getenv('LDRRMO_DB_USER');
    $password = getenv('LDRRMO_DB_PASSWORD');
    if (!$host || !$port || !$name || !$user || $password === false) {
        throw new RuntimeException('Database environment variables are not fully configured.');
    }
    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";

    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");

    return $pdo;
}
