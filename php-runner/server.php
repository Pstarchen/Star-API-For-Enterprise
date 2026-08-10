<?php
declare(strict_types=1);

const MAX_PACKAGE_BYTES = 33554432;
const MAX_REQUEST_BYTES = 2097152;
const MAX_RESPONSE_BYTES = 8388608;
const PROCESS_TIMEOUT_SECONDS = 12;

function respond(int $status, array $payload): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function clean_path(string $path): ?string {
    $path = preg_replace('#/+#', '/', str_replace('\\', '/', $path));
    $path = preg_replace('#^\./#', '', $path ?? '');
    if (!$path || str_starts_with($path, '/') || str_contains($path, "\0")) return null;
    foreach (explode('/', $path) as $part) if ($part === '' || $part === '.' || $part === '..') return null;
    return $path;
}

function remove_tree(string $directory): void {
    if (!is_dir($directory)) return;
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($iterator as $item) $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    rmdir($directory);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) === '/health') respond(200, ['status' => 'ok']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) !== '/execute') respond(404, ['message' => 'not found']);

$expected = getenv('RUNNER_SECRET') ?: '';
$provided = $_SERVER['HTTP_X_RUNNER_SECRET'] ?? '';
if (strlen($expected) < 32 || !hash_equals($expected, $provided)) respond(401, ['message' => 'unauthorized']);

$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) > 50000000) respond(413, ['message' => 'payload too large']);
$input = json_decode($raw, true);
if (!is_array($input) || !is_array($input['files'] ?? null) || !is_array($input['request'] ?? null)) respond(400, ['message' => 'invalid payload']);

$entry = clean_path((string)($input['entryFile'] ?? 'index.php'));
if (!$entry || !str_ends_with(strtolower($entry), '.php')) respond(400, ['message' => 'invalid entry file']);
$directory = '/tmp/starapi-' . bin2hex(random_bytes(12));
if (!mkdir($directory, 0700, true)) respond(500, ['message' => 'workspace unavailable']);
register_shutdown_function(static fn() => remove_tree($directory));

try {
    $total = 0;
    foreach ($input['files'] as $file) {
        if (!is_array($file)) respond(400, ['message' => 'invalid package file']);
        $path = clean_path((string)($file['path'] ?? ''));
        $data = base64_decode((string)($file['data'] ?? ''), true);
        if (!$path || $data === false) respond(400, ['message' => 'invalid package file']);
        $total += strlen($data);
        if ($total > MAX_PACKAGE_BYTES) respond(413, ['message' => 'package too large']);
        $target = $directory . '/' . $path;
        if (!is_dir(dirname($target)) && !mkdir(dirname($target), 0700, true)) respond(500, ['message' => 'workspace unavailable']);
        if (file_put_contents($target, $data, LOCK_EX) === false) respond(500, ['message' => 'workspace unavailable']);
    }
    $script = $directory . '/' . $entry;
    if (!is_file($script)) respond(400, ['message' => 'entry file missing']);

    $request = $input['request'];
    $body = base64_decode((string)($request['body'] ?? ''), true);
    if ($body === false || strlen($body) > MAX_REQUEST_BYTES) respond(413, ['message' => 'request body too large']);
    $method = strtoupper((string)($request['method'] ?? 'GET'));
    if (!in_array($method, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], true)) respond(400, ['message' => 'invalid method']);
    $query = (string)($request['query'] ?? '');
    $path = '/' . ltrim((string)($request['path'] ?? '/'), '/');
    $headers = is_array($request['headers'] ?? null) ? $request['headers'] : [];

    $environment = [
        'PATH' => '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'GATEWAY_INTERFACE' => 'CGI/1.1',
        'SERVER_PROTOCOL' => 'HTTP/1.1',
        'SERVER_SOFTWARE' => 'Star-API-PHP-Runner',
        'SERVER_NAME' => 'star-api-runner',
        'SERVER_PORT' => '80',
        'REDIRECT_STATUS' => '1',
        'REQUEST_METHOD' => $method,
        'REQUEST_URI' => $path . ($query !== '' ? '?' . $query : ''),
        'QUERY_STRING' => $query,
        'SCRIPT_FILENAME' => $script,
        'SCRIPT_NAME' => '/' . $entry,
        'DOCUMENT_ROOT' => $directory,
        'CONTENT_LENGTH' => (string)strlen($body),
        'CONTENT_TYPE' => (string)($headers['content-type'] ?? ''),
    ];
    foreach ($headers as $name => $value) {
        $normalized = strtoupper(str_replace('-', '_', (string)$name));
        if (preg_match('/^[A-Z0-9_]+$/', $normalized) && !in_array($normalized, ['AUTHORIZATION', 'X_API_KEY', 'COOKIE', 'CONTENT_TYPE', 'CONTENT_LENGTH'], true)) $environment['HTTP_' . $normalized] = substr((string)$value, 0, 8192);
    }

    $disabled = implode(',', ['exec','shell_exec','system','passthru','proc_open','popen','pcntl_exec','putenv','mail','dl','link','symlink']);
    $command = ['php-cgi83', '-d', 'open_basedir=' . $directory, '-d', 'allow_url_fopen=0', '-d', 'allow_url_include=0', '-d', 'disable_functions=' . $disabled, '-d', 'memory_limit=128M', '-d', 'max_execution_time=10', '-d', 'display_errors=0', '-d', 'log_errors=0', '-d', 'expose_php=0'];
    $pipes = [];
    $process = proc_open($command, [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes, $directory, $environment);
    if (!is_resource($process)) respond(500, ['message' => 'runtime unavailable']);
    fwrite($pipes[0], $body); fclose($pipes[0]);
    stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
    $stdout = ''; $stderr = ''; $started = microtime(true); $timedOut = false;
    while (true) {
        $stdout .= stream_get_contents($pipes[1]);
        $stderr .= stream_get_contents($pipes[2]);
        if (strlen($stdout) > MAX_RESPONSE_BYTES + 65536) { proc_terminate($process, 9); break; }
        $status = proc_get_status($process);
        if (!$status['running']) break;
        if (microtime(true) - $started > PROCESS_TIMEOUT_SECONDS) { $timedOut = true; proc_terminate($process, 9); break; }
        usleep(20000);
    }
    $stdout .= stream_get_contents($pipes[1]); $stderr .= stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]); proc_close($process);
    if ($timedOut) respond(504, ['message' => 'execution timeout']);
    if (strlen($stdout) > MAX_RESPONSE_BYTES + 65536) respond(502, ['message' => 'response too large']);

    $parts = preg_split("/\r?\n\r?\n/", $stdout, 2);
    $headerBlock = count($parts) === 2 ? $parts[0] : '';
    $responseBody = count($parts) === 2 ? $parts[1] : $stdout;
    $responseStatus = 200; $responseHeaders = [];
    foreach (preg_split('/\r?\n/', $headerBlock) as $line) {
        if (stripos($line, 'Status:') === 0) $responseStatus = (int)trim(substr($line, 7));
        elseif (str_contains($line, ':')) {
            [$name, $value] = array_map('trim', explode(':', $line, 2));
            $lower = strtolower($name);
            if (in_array($lower, ['content-type', 'content-disposition', 'cache-control'], true) || str_starts_with($lower, 'x-')) $responseHeaders[$name] = substr($value, 0, 8192);
        }
    }
    if ($responseStatus < 100 || $responseStatus > 599) $responseStatus = 500;
    if (!isset($responseHeaders['Content-Type']) && !isset($responseHeaders['content-type'])) $responseHeaders['Content-Type'] = 'text/html; charset=utf-8';
    respond(200, ['status' => $responseStatus, 'headers' => $responseHeaders, 'body' => base64_encode($responseBody), 'runtimeError' => $responseStatus >= 500 && $stderr !== '' ? 'PHP_RUNTIME_ERROR' : null]);
} finally {
    remove_tree($directory);
}
