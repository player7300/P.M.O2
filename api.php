<?php
header('Content-Type: application/json; charset=utf-8');

// مسیر ذخیره‌سازی کلید محرمانه روی سرور
$configFilePath = __DIR__ . '/config_secret.json';

// دریافت ورودی JSON از کلاینت
$inputData = json_decode(file_get_contents('php://input'), true);
$action = $inputData['action'] ?? '';

if ($action === 'save_key') {
    $apiKey = trim($inputData['key'] ?? '');
    if (!empty($apiKey)) {
        $saved = file_put_contents($configFilePath, json_encode(['api_key' => $apiKey], JSON_PRETTY_PRINT));
        if ($saved !== false) {
            echo json_encode(['status' => 'success', 'message' => 'کلید API با موفقیت و به صورت امن ذخیره شد.']);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'خطا در ذخیره‌سازی فایل روی سرور.']);
        }
    } else {
        echo json_encode(['status' => 'error', 'message' => 'کلید API نمی‌تواند خالی باشد.']);
    }
    exit;
}

if ($action === 'run_ai') {
    if (!file_exists($configFilePath)) {
        echo json_encode(['error' => 'هیچ کلید API روی سرور پیدا نشد. ابتدا کلید را در بخش مدیریت ذخیره کنید.']);
        exit;
    }

    $config = json_decode(file_get_contents($configFilePath), true);
    $apiKey = $config['api_key'] ?? '';

    if (empty($apiKey)) {
        echo json_encode(['error' => 'کلید API ثبت نشده است.']);
        exit;
    }

    $userPrompt = $inputData['prompt'] ?? '';

    // ارسال درخواست CURL به API مربوطه (به عنوان نمونه OpenAI GPT)
    $ch = curl_init('https://api.openai.com/v1/chat/completions');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $apiKey
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'model' => 'gpt-3.5-turbo',
        'messages' => [
            ['role' => 'user', 'content' => $userPrompt]
        ]
    ]));

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($response === false) {
        echo json_encode(['error' => 'ارتباط با سرور API برقرار نشد.']);
        exit;
    }

    $responseData = json_decode($response, true);
    if (isset($responseData['choices'][0]['message']['content'])) {
        echo json_encode(['result' => $responseData['choices'][0]['message']['content']]);
    } elseif (isset($responseData['error']['message'])) {
        echo json_encode(['error' => 'خطای API: ' . $responseData['error']['message']]);
    } else {
        echo json_encode(['error' => 'پاسخ نامشخص از سرور دریافت شد.']);
    }
    exit;
}

echo json_encode(['error' => 'درخواست نامعتبر است.']);
