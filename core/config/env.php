<?php
/**
 * core/config/env.php
 *
 * Loads variables from the project root .env file into $_ENV and getenv().
 * Must be required before db.php or any code that reads env values.
 */

function loadEnv(string $path): void
{
    if (!file_exists($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    foreach ($lines as $line) {
        // Skip comment lines
        $line = trim($line);
        if ($line === '' || $line[0] === '#') {
            continue;
        }

        // Only process lines with an = sign
        if (!str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);
        $key   = trim($key);
        $value = trim($value);

        // Strip surrounding quotes if present
        if (
            strlen($value) >= 2 &&
            (($value[0] === '"'  && $value[-1] === '"') ||
             ($value[0] === "'"  && $value[-1] === "'"))
        ) {
            $value = substr($value, 1, -1);
        }

        // Always set from file — overrides any pre-existing system env value
        // so that editing .env always takes effect without a server restart.
        $_ENV[$key] = $value;
        putenv("{$key}={$value}");
    }
}

// Resolve the project root: env.php is at core/config/, root is two levels up
$projectRoot = dirname(__DIR__, 2);   // /media/codex/Shared/iSeeGrass
loadEnv($projectRoot . '/.env');

/**
 * Convenience wrapper — reads from $_ENV with an optional default.
 */
function env(string $key, mixed $default = null): mixed
{
    if (array_key_exists($key, $_ENV)) {
        return $_ENV[$key];
    }
    $val = getenv($key);
    return ($val !== false) ? $val : $default;
}
