<?php
/**
 * core/config/cors.php
 *
 * Must be the FIRST include in every API endpoint.
 * Sends CORS headers and handles OPTIONS preflight immediately —
 * before any auth check, DB connection, or other logic runs.
 *
 * Also starts output buffering so any accidental PHP notice/warning
 * doesn't corrupt the JSON response body.
 *
 * APP_URL in .env is always added to the allowed-origins list so the
 * live deployment never needs a code change — only a .env update.
 */

// Start output buffer immediately — discards any stray output before JSON is sent.
ob_start();

// Load environment variables so APP_URL is available.
// env.php is idempotent; requiring it here is safe even if db.php already
// loaded it earlier (PHP's require_once deduplicates by resolved path).
require_once __DIR__ . '/env.php';

$appUrl = rtrim(env('APP_URL', ''), '/');   // e.g. https://iseegrass-cap-development.up.railway.app

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

$allowed = array_filter([
    $appUrl,                        // live domain from .env
    'http://localhost:3000',
    'http://localhost',
    'http://127.0.0.1',
    'http://127.0.0.1:3000',
    'capacitor://localhost',
]);

if ($origin !== '' && in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: {$origin}");
} else {
    // No Origin header (same-origin curl / direct PHP call).
    // Fall back to the configured app URL so the default is never localhost
    // on a production server.
    header("Access-Control-Allow-Origin: {$appUrl}");
}

header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Max-Age: 600');

// Answer preflight immediately — no auth, no DB
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
