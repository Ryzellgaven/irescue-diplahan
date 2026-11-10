<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config.php';

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

try {
    database()->query('SELECT 1');
    http_response_code(200);
    echo "ok\n";
} catch (Throwable $error) {
    error_log('[LDRRMO health check] ' . $error::class . ': ' . $error->getMessage());
    http_response_code(503);
    echo "unavailable\n";
}
