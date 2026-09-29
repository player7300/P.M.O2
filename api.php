<?php
declare(strict_types=1);

/*
 * Personal Project Archive API
 * Server-side sessions + password hashing + protected AI API key.
 */
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_set_cookie_params([
    'httponly' => true,
    'secure' => $isHttps,
    'samesite' => 'Lax',
]);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$dataFile = __DIR__ . '/data.json';
$configFile = __DIR__ . '/config_secret.json';

function respond(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function defaultData(): array {
    return [
        'users' => [
            [
                'id' => '1000000001',
                'username' => 'admin',
                'password' => password_hash('admin123', PASSWORD_DEFAULT),
                'role' => 'admin',
                'nickname' => 'Admin',
                'avatar' => ''
            ],
            [
                'id' => '1000000002',
                'username' => 'test',
                'password' => password_hash('123456', PASSWORD_DEFAULT),
                'role' => 'user',
                'nickname' => 'Test',
                'avatar' => ''
            ]
        ],
        'projects' => [],
        'chat' => []
    ];
}

function readData(): array {
    global $dataFile;
    if (!file_exists($dataFile)) {
        $data = defaultData();
        writeData($data);
        return $data;
    }

    $raw = file_get_contents($dataFile);
    $data = json_decode($raw ?: '', true);
    if (!is_array($data)) {
        $data = defaultData();
    }
    $data['users'] ??= [];
    $data['projects'] ??= [];
    $data['chat'] ??= [];

    // One-time migration from the old plaintext-password format.
    $changed = false;
    foreach ($data['users'] as &$user) {
        $user['nickname'] = $user['nickname'] ?? $user['username'] ?? 'User';
        $user['avatar'] = $user['avatar'] ?? '';
        if (!empty($user['password']) &&
            !str_starts_with((string)$user['password'], '$2y$') &&
            !str_starts_with((string)$user['password'], '$2a$') &&
            !str_starts_with((string)$user['password'], '$2b$')) {
            $user['password'] = password_hash((string)$user['password'], PASSWORD_DEFAULT);
            $changed = true;
        }
    }
    unset($user);
    if ($changed) {
        writeData($data);
    }
    return $data;
}

function writeData(array $data): void {
    global $dataFile;
    $fp = fopen($dataFile, 'c+');
    if (!$fp) {
        respond(['error' => 'Could not open data storage.'], 500);
    }
    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        respond(['error' => 'Could not lock data storage.'], 500);
    }
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

function safeUser(array $user): array {
    return [
        'id' => (string)($user['id'] ?? ''),
        'username' => (string)($user['username'] ?? ''),
        'role' => (string)($user['role'] ?? 'user'),
        'nickname' => (string)($user['nickname'] ?? $user['username'] ?? ''),
        'avatar' => (string)($user['avatar'] ?? '')
    ];
}

function currentUser(): ?array {
    if (empty($_SESSION['user_id'])) return null;
    $data = readData();
    foreach ($data['users'] as $user) {
        if ((string)$user['id'] === (string)$_SESSION['user_id']) {
            return safeUser($user);
        }
    }
    unset($_SESSION['user_id']);
    return null;
}

function requireLogin(): array {
    $user = currentUser();
    if (!$user) respond(['error' => 'Authentication required.'], 401);
    return $user;
}

function requireAdmin(): array {
    $user = requireLogin();
    if (($user['role'] ?? '') !== 'admin') respond(['error' => 'Administrator privileges required.'], 403);
    return $user;
}

function randomId(): string {
    return (string)random_int(1000000000, 9999999999);
}

function randomChatId(): string {
    return 'MSG-' . bin2hex(random_bytes(8));
}

function cleanText($value, int $max = 4000): string {
    $value = trim((string)$value);
    if (strlen($value) > $max) $value = substr($value, 0, $max);
    return $value;
}

$data = readData();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $user = currentUser();
    if (!$user) respond(['authenticated' => false, 'users' => [], 'projects' => [], 'chat' => []]);

    $data = readData();
    respond([
        'authenticated' => true,
        'currentUser' => $user,
        'users' => array_map('safeUser', $data['users']),
        'projects' => $data['projects'],
        'chat' => array_slice($data['chat'], -200)
    ]);
}

if ($method !== 'POST') respond(['error' => 'Method not allowed.'], 405);

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) respond(['error' => 'Invalid JSON body.'], 400);
$action = (string)($input['action'] ?? '');

if ($action === 'login') {
    $username = cleanText($input['username'] ?? '', 100);
    $password = (string)($input['password'] ?? '');
    foreach (readData()['users'] as $user) {
        if (strcasecmp((string)$user['username'], $username) === 0 &&
            password_verify($password, (string)($user['password'] ?? ''))) {
            session_regenerate_id(true);
            $_SESSION['user_id'] = $user['id'];
            respond(['success' => true, 'currentUser' => safeUser($user)]);
        }
    }
    usleep(250000);
    respond(['error' => 'Invalid username or password.'], 401);
}

if ($action === 'logout') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool)$params['secure'], (bool)$params['httponly']);
    }
    session_destroy();
    respond(['success' => true]);
}

if ($action === 'save_data') {
    requireAdmin();
    $incoming = $input['data'] ?? [];
    if (!is_array($incoming) || !isset($incoming['projects']) || !is_array($incoming['projects'])) {
        respond(['error' => 'Invalid project data.'], 400);
    }
    $data = readData();
    $data['projects'] = $incoming['projects'];
    writeData($data);
    respond(['success' => true]);
}

if ($action === 'update_profile') {
    $user = requireLogin();
    $nickname = cleanText($input['nickname'] ?? '', 60);
    $avatar = cleanText($input['avatar'] ?? '', 500);
    if ($nickname === '') respond(['error' => 'Nickname is required.'], 400);
    if ($avatar !== '' && !filter_var($avatar, FILTER_VALIDATE_URL)) respond(['error' => 'Avatar must be a valid URL.'], 400);

    $data = readData();
    foreach ($data['users'] as &$u) {
        if ((string)$u['id'] === (string)$user['id']) {
            $u['nickname'] = $nickname;
            $u['avatar'] = $avatar;
            break;
        }
    }
    unset($u);
    writeData($data);
    respond(['success' => true, 'currentUser' => currentUser()]);
}

if ($action === 'send_chat') {
    $user = requireLogin();
    $message = cleanText($input['message'] ?? '', 2000);
    if ($message === '') respond(['error' => 'Message is empty.'], 400);

    $data = readData();
    $data['chat'][] = [
        'id' => randomChatId(),
        'userId' => $user['id'],
        'nickname' => $user['nickname'],
        'avatar' => $user['avatar'],
        'message' => $message,
        'createdAt' => date('c')
    ];
    if (count($data['chat']) > 500) $data['chat'] = array_slice($data['chat'], -500);
    writeData($data);
    respond(['success' => true, 'message' => end($data['chat'])]);
}

if ($action === 'create_user') {
    requireAdmin();
    $username = cleanText($input['username'] ?? '', 60);
    $password = (string)($input['password'] ?? '');
    $role = ($input['role'] ?? 'user') === 'admin' ? 'admin' : 'user';
    $nickname = cleanText($input['nickname'] ?? $username, 60);
    if ($username === '' || strlen($password) < 6) respond(['error' => 'Username and password (minimum 6 characters) are required.'], 400);

    $data = readData();
    foreach ($data['users'] as $u) {
        if (strcasecmp($u['username'], $username) === 0) respond(['error' => 'Username already exists.'], 409);
    }
    $data['users'][] = [
        'id' => randomId(),
        'username' => $username,
        'password' => password_hash($password, PASSWORD_DEFAULT),
        'role' => $role,
        'nickname' => $nickname ?: $username,
        'avatar' => ''
    ];
    writeData($data);
    respond(['success' => true]);
}

if ($action === 'update_user') {
    requireAdmin();
    $id = (string)($input['id'] ?? '');
    $username = cleanText($input['username'] ?? '', 60);
    $password = (string)($input['password'] ?? '');
    $role = ($input['role'] ?? 'user') === 'admin' ? 'admin' : 'user';
    if ($username === '') respond(['error' => 'Username is required.'], 400);

    $data = readData();
    $found = false;
    foreach ($data['users'] as &$u) {
        if ((string)$u['id'] === $id) {
            $found = true;
            foreach ($data['users'] as $other) {
                if ((string)$other['id'] !== $id && strcasecmp($other['username'], $username) === 0) {
                    respond(['error' => 'Username already exists.'], 409);
                }
            }
            $u['username'] = $username;
            $u['role'] = ($id === '1000000001') ? 'admin' : $role;
            if ($password !== '') {
                if (strlen($password) < 6) respond(['error' => 'Password must be at least 6 characters.'], 400);
                $u['password'] = password_hash($password, PASSWORD_DEFAULT);
            }
            $u['nickname'] = $u['nickname'] ?? $username;
            break;
        }
    }
    unset($u);
    if (!$found) respond(['error' => 'User not found.'], 404);
    writeData($data);
    respond(['success' => true]);
}

if ($action === 'delete_user') {
    requireAdmin();
    $id = (string)($input['id'] ?? '');
    if ($id === '1000000001') respond(['error' => 'Main administrator cannot be deleted.'], 400);
    $data = readData();
    $data['users'] = array_values(array_filter($data['users'], fn($u) => (string)$u['id'] !== $id));
    writeData($data);
    respond(['success' => true]);
}

function aiProviders(): array {
    return [
        'openai' => [
            'name' => 'OpenAI',
            'url' => 'https://api.openai.com/v1/chat/completions',
            'models' => ['gpt-5.6', 'gpt-5.6-mini', 'gpt-5.5', 'gpt-4o-mini']
        ],
        'google' => [
            'name' => 'Google Gemini',
            'url' => 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
            'models' => ['gemini-3.8-flash', 'gemini-3.8-pro']
        ],
        'anthropic' => [
            'name' => 'Anthropic Claude',
            'url' => 'https://api.anthropic.com/v1/messages',
            'models' => ['claude-opus-4-8', 'claude-sonnet-4-5']
        ],
        'deepseek' => [
            'name' => 'DeepSeek',
            'url' => 'https://api.deepseek.com/chat/completions',
            'models' => ['deepseek-flash', 'deepseek-v4-pro']
        ],
        'groq' => [
            'name' => 'Groq',
            'url' => 'https://api.groq.com/openai/v1/chat/completions',
            'models' => ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b']
        ],
        'mistral' => [
            'name' => 'Mistral AI',
            'url' => 'https://api.mistral.ai/v1/chat/completions',
            'models' => ['mistral-large-latest', 'mistral-small-latest']
        ],
        'xai' => [
            'name' => 'xAI / Grok',
            'url' => 'https://api.x.ai/v1/chat/completions',
            'models' => ['grok-4', 'grok-4-fast']
        ],
        'cohere' => [
            'name' => 'Cohere',
            'url' => 'https://api.cohere.com/v2/chat',
            'models' => ['command-a-03-2025']
        ]
    ];
}

function loadAIConfig(): array {
    global $configFile;
    if (!file_exists($configFile)) return ['provider' => 'openai', 'api_key' => '', 'model' => 'gpt-5.6'];
    $config = json_decode(file_get_contents($configFile), true);
    return is_array($config) ? $config : ['provider' => 'openai', 'api_key' => '', 'model' => 'gpt-5.6'];
}

function callAI(string $provider, string $apiKey, string $model, string $prompt): array {
    $providers = aiProviders();
    if (!isset($providers[$provider])) return ['ok'=>false, 'error'=>'Unsupported AI provider.'];

    $p = $providers[$provider];
    $headers = ['Content-Type: application/json'];
    $url = $p['url'];
    $body = [];

    if ($provider === 'google') {
        $url = str_replace('{model}', rawurlencode($model), $url) . '?key=' . rawurlencode($apiKey);
        $body = ['contents' => [['parts' => [['text' => $prompt]]]]];
    } elseif ($provider === 'anthropic') {
        $headers[] = 'x-api-key: ' . $apiKey;
        $headers[] = 'anthropic-version: 2023-06-01';
        $body = ['model'=>$model, 'max_tokens'=>2048, 'messages'=>[['role'=>'user','content'=>$prompt]]];
    } elseif ($provider === 'cohere') {
        $headers[] = 'Authorization: Bearer ' . $apiKey;
        $body = ['model'=>$model, 'messages'=>[['role'=>'user','content'=>$prompt]]];
    } else {
        $headers[] = 'Authorization: Bearer ' . $apiKey;
        $body = [
            'model' => $model,
            'messages' => [
                ['role'=>'system', 'content'=>'You are the private AI assistant for the site administrator.'],
                ['role'=>'user', 'content'=>$prompt]
            ],
            'temperature' => 0.7
        ];
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_TIMEOUT => 90,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($response === false) return ['ok'=>false, 'error'=>'AI connection failed: '.$curlError];
    $data = json_decode($response, true);

    if ($httpCode >= 200 && $httpCode < 300) {
        $text = '';
        if ($provider === 'google') {
            $text = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
        } elseif ($provider === 'anthropic') {
            $text = $data['content'][0]['text'] ?? '';
        } elseif ($provider === 'cohere') {
            $text = $data['message']['content'][0]['text'] ?? '';
        } else {
            $text = $data['choices'][0]['message']['content'] ?? '';
        }
        if ($text !== '') return ['ok'=>true, 'text'=>$text];
    }

    $err = $data['error']['message'] ?? $data['message'] ?? ('AI request failed with HTTP '.$httpCode.'.');
    return ['ok'=>false, 'error'=>(string)$err];
}

if ($action === 'ai_config') {
    requireAdmin();
    $config = loadAIConfig();
    respond([
        'providers' => aiProviders(),
        'provider' => $config['provider'] ?? 'openai',
        'model' => $config['model'] ?? 'gpt-5.6',
        'configured' => !empty($config['api_key'])
    ]);
}

if ($action === 'save_ai_config') {
    requireAdmin();
    global $configFile;
    $provider = cleanText($input['provider'] ?? 'openai', 40);
    $model = cleanText($input['model'] ?? '', 120);
    $apiKey = trim((string)($input['key'] ?? ''));

    $providers = aiProviders();
    if (!isset($providers[$provider])) respond(['error'=>'Unsupported AI provider.'], 400);
    if ($model === '') $model = $providers[$provider]['models'][0];
    if (!in_array($model, $providers[$provider]['models'], true)) respond(['error'=>'Unsupported model for this provider.'], 400);

    $old = loadAIConfig();
    if ($apiKey === '') $apiKey = (string)($old['api_key'] ?? '');
    if ($apiKey === '') respond(['error'=>'API key cannot be empty.'], 400);

    $payload = json_encode(['provider'=>$provider, 'model'=>$model, 'api_key'=>$apiKey], JSON_UNESCAPED_SLASHES);
    if (file_put_contents($configFile, $payload, LOCK_EX) === false) {
        respond(['error'=>'Could not save the AI configuration. Check server permissions.'], 500);
    }
    respond(['success'=>true, 'provider'=>$provider, 'model'=>$model, 'message'=>'AI configuration saved. The API key is never returned to the browser.']);
}

if ($action === 'run_ai' || $action === 'ai_chat') {
    requireAdmin();
    $config = loadAIConfig();
    $apiKey = trim((string)($config['api_key'] ?? ''));
    $provider = (string)($config['provider'] ?? 'openai');
    $model = (string)($config['model'] ?? '');

    if ($apiKey === '') respond(['error'=>'No AI API key has been configured.'], 400);
    $prompt = cleanText($input['prompt'] ?? '', 12000);
    if ($prompt === '') respond(['error'=>'Prompt is empty.'], 400);

    $result = callAI($provider, $apiKey, $model, $prompt);
    if ($result['ok']) respond(['result'=>$result['text'], 'provider'=>$provider, 'model'=>$model]);
    respond(['error'=>$result['error']], 502);
}

respond(['error' => 'Invalid action.'], 400);
?>
