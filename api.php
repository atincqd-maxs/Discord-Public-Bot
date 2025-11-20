<?php
require 'vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
$dotenv->load();

session_start();

define('AES_SECRET_KEY', "bEknSKkaaASSS34359966");

function getDerivedKey() {
    return hash('sha256', AES_SECRET_KEY, true);
}

function decryptPayload($encryptedBase64) {
    try {
        $parts = explode(':', $encryptedBase64, 2);
        if (count($parts) !== 2) {
            throw new Exception("Geçersiz şifreli veri formatı (IV eksik).");
        }
        
        $iv = base64_decode($parts[0]);
        $encryptedData = base64_decode($parts[1]);
        $key = getDerivedKey();
        
        if (strlen($iv) !== 16) {
             throw new Exception("Geçersiz IV uzunluğu: " . strlen($iv));
        }

        $decrypted = openssl_decrypt(
            $encryptedData,
            'AES-256-CBC',
            $key,
            OPENSSL_RAW_DATA,
            $iv
        );
        
        if ($decrypted === false) {
            throw new Exception("OpenSSL şifre çözme hatası: " . openssl_error_string());
        }

        $jsonData = json_decode($decrypted, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
             throw new Exception("Çözülen veri JSON değil: " . json_last_error_msg());
        }
        return $jsonData;

    } catch (Exception $e) {
        error_log("AES Decrypt Hatası: " . $e->getMessage());
        return null;
    }
}

function encryptPayload($data) {
    try {
        $key = getDerivedKey();
        $iv = openssl_random_pseudo_bytes(16);
        
        $encrypted = openssl_encrypt(
            json_encode($data),
            'AES-256-CBC',
            $key,
            OPENSSL_RAW_DATA,
            $iv
        );

        if ($encrypted === false) {
             throw new Exception("OpenSSL şifreleme hatası: " . openssl_error_string());
        }
        
        return base64_encode($iv) . ":" . base64_encode($encrypted);

    } catch (Exception $e) {
         error_log("AES Encrypt Hatası: " . $e->getMessage());
        return null;
    }
}

$slashCommandsDir = __DIR__ . '/commands';
$prefixCommandsDir = __DIR__ . '/commands_notslash';
$syncTriggerFile = __DIR__ . '/sync.trigger';
$guildDataFile = __DIR__ . '/guild_data.json';

if (!is_dir($prefixCommandsDir)) mkdir($prefixCommandsDir);

function getDb() {
    static $db = null;
    if ($db === null) {
        try {
            mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
            $db = new mysqli($_ENV['DB_HOST'], $_ENV['DB_USER'], $_ENV['DB_PASS'], $_ENV['DB_NAME']);
            $db->set_charset('utf8mb4');
            
            $db->query("
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(255) NOT NULL UNIQUE,
                    hard_enc_password VARCHAR(255) NOT NULL,
                    erisim TINYINT(1) DEFAULT 0,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ");
             $db->query("
                CREATE TABLE IF NOT EXISTS rate_limits (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    identifier VARCHAR(255) NOT NULL,
                    type ENUM('login_fail', 'register_success', 'login_block', 'register_block') NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NULL DEFAULT NULL,
                    INDEX idx_identifier_type_expires (identifier, type, expires_at)
                )
            ");
            $db->query("DELETE FROM rate_limits WHERE timestamp < (NOW() - INTERVAL 1 DAY)");


        } catch (mysqli_sql_exception $e) {
            error_log("Database connection failed: " . $e->getMessage());
             header('Content-Type: application/json');
             echo json_encode(['error' => 'Veritabanı bağlantısı kurulamadı. Lütfen sunucu loglarını kontrol edin.']);
             exit;
        }
    }
    return $db;
}

$db = getDb();

header('Content-Type: application/json');
$inputJSON = file_get_contents('php://input');
$input = json_decode($inputJSON, true);

if (isset($input['q']) && $_SERVER['REQUEST_METHOD'] === 'POST') {
    
    $decryptedData = decryptPayload($input['q']);
    $response = [];

    $isPublicAction = false;

    if ($decryptedData && isset($decryptedData['action'])) {
        
        $clientFingerprint = $decryptedData['fingerprint'] ?? 'no_fingerprint';
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown_ip';
        $identifier = hash('sha256', $ip . $clientFingerprint);

        try {
            switch ($decryptedData['action']) {
                case 'register':
                    $isPublicAction = true; // Bu halka açık bir eylem
                    // YENİ: Kayıt engeli var mı?
                    $stmt = $db->prepare("SELECT expires_at FROM rate_limits WHERE identifier = ? AND type = 'register_block' AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1");
                    $stmt->bind_param('s', $identifier);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    if ($block = $result->fetch_assoc()) {
                        $remaining = strtotime($block['expires_at']) - time();
                        $response = ['status' => 'error', 'message' => "Çok fazla kayıt denemesi. Lütfen $remaining saniye sonra tekrar deneyin."];
                        $stmt->close();
                        break;
                    }
                    $stmt->close();

                    // YENİ: 1 saat içinde 5 kayıt yapılmış mı?
                    $stmt = $db->prepare("SELECT COUNT(*) as count FROM rate_limits WHERE identifier = ? AND type = 'register_success' AND timestamp > (NOW() - INTERVAL 1 HOUR)");
                    $stmt->bind_param('s', $identifier);
                    $stmt->execute();
                    $count = $stmt->get_result()->fetch_assoc()['count'];
                    $stmt->close();

                    if ($count >= 5) {
                        // 10 dakika engelle
                        $stmt = $db->prepare("INSERT INTO rate_limits (identifier, type, expires_at) VALUES (?, 'register_block', NOW() + INTERVAL 10 MINUTE)");
                        $stmt->bind_param('s', $identifier);
                        $stmt->execute();
                        $stmt->close();
                        $response = ['status' => 'error', 'message' => 'Bir saat içinde çok fazla kayıt olma işlemi yaptınız. Lütfen 10 dakika bekleyin.'];
                        break;
                    }
                    
                    // --- Normal Kayıt İşlemi ---
                    $username = $decryptedData['username'] ?? '';
                    $password = $decryptedData['password'] ?? '';

                    if (empty($username) || empty($password)) {
                        $response = ['status' => 'error', 'message' => 'Kullanıcı adı ve şifre gereklidir.'];
                        break;
                    }
                    if (strlen($password) < 6) {
                         $response = ['status' => 'error', 'message' => 'Şifre en az 6 karakter olmalıdır.'];
                         break;
                    }

                    // Kullanıcı adı zaten var mı?
                    $stmt = $db->prepare("SELECT id FROM users WHERE username = ?");
                    $stmt->bind_param('s', $username);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    
                    if ($result->num_rows > 0) {
                        $response = ['status' => 'error', 'message' => 'Bu kullanıcı adı zaten alınmış.'];
                    } else {
                        // Şifreyi GÜVENLİ bir şekilde hash'le (bcrypt)
                        $hashed_password = password_hash($password, PASSWORD_DEFAULT);

                        $stmt = $db->prepare("INSERT INTO users (username, hard_enc_password) VALUES (?, ?)");
                        $stmt->bind_param('ss', $username, $hashed_password);
                        $stmt->execute();
                        
                        // YENİ: Başarılı kaydı logla
                        $stmt_log = $db->prepare("INSERT INTO rate_limits (identifier, type) VALUES (?, 'register_success')");
                        $stmt_log->bind_param('s', $identifier);
                        $stmt_log->execute();
                        $stmt_log->close();
                        
                        $response = ['status' => 'success', 'message' => 'Kayıt başarılı! Hesabınızın yetkili tarafından onaylanmasını bekleyiniz.'];
                    }
                    $stmt->close();
                    break;
                
                case 'login':
                    $isPublicAction = true; // Bu halka açık bir eylem
                    // YENİ: Giriş engeli var mı?
                    $stmt = $db->prepare("SELECT expires_at FROM rate_limits WHERE identifier = ? AND type = 'login_block' AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1");
                    $stmt->bind_param('s', $identifier);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    if ($block = $result->fetch_assoc()) {
                        $remaining = strtotime($block['expires_at']) - time();
                        $response = ['status' => 'error', 'message' => "Çok fazla hatalı giriş denemesi. Lütfen $remaining saniye sonra tekrar deneyin."];
                        $stmt->close();
                        break;
                    }
                    $stmt->close();
                    
                    // --- Normal Giriş İşlemi ---
                    $username = $decryptedData['username'] ?? '';
                    $password = $decryptedData['password'] ?? '';

                    if (empty($username) || empty($password)) {
                        $response = ['status' => 'error', 'message' => 'Kullanıcı adı ve şifre gereklidir.'];
                        break;
                    }

                    $stmt = $db->prepare("SELECT id, hard_enc_password, erisim FROM users WHERE username = ?");
                    $stmt->bind_param('s', $username);
                    $stmt->execute();
                    $result = $stmt->get_result();

                    if ($user = $result->fetch_assoc()) {
                        // Gelen şifreyi, DB'deki hash ile doğrula
                        if (password_verify($password, $user['hard_enc_password'])) {
                            
                            // YENİ: Giriş başarılı, eski hatalı denemeleri temizle
                            $stmt_clear = $db->prepare("DELETE FROM rate_limits WHERE identifier = ? AND (type = 'login_fail' OR type = 'login_block')");
                            $stmt_clear->bind_param('s', $identifier);
                            $stmt_clear->execute();
                            $stmt_clear->close();
                            
                            if ($user['erisim'] == 1) {
                                // Erişim onaylanmış
                                $_SESSION['user_id'] = $user['id']; // Sunucu tarafında oturum aç
                                $response = ['status' => 'success', 'erisim' => 1];
                            } else {
                                // Erişim bekliyor
                                $response = ['status' => 'pending', 'erisim' => 0, 'message' => 'Lütfen hesabınızın yetkili tarafından onaylanmasını bekleyiniz.'];
                            }
                        } else {
                            // Şifre yanlış
                            // YENİ: Hatalı girişi logla
                            $stmt_log = $db->prepare("INSERT INTO rate_limits (identifier, type) VALUES (?, 'login_fail')");
                            $stmt_log->bind_param('s', $identifier);
                            $stmt_log->execute();
                            $stmt_log->close();

                            // YENİ: Engelleme gerekiyor mu? (1 dakikada 10 hata)
                            $stmt_count = $db->prepare("SELECT COUNT(*) as count FROM rate_limits WHERE identifier = ? AND type = 'login_fail' AND timestamp > (NOW() - INTERVAL 1 MINUTE)");
                            $stmt_count->bind_param('s', $identifier);
                            $stmt_count->execute();
                            $count = $stmt_count->get_result()->fetch_assoc()['count'];
                            $stmt_count->close();

                            if ($count >= 10) {
                                // 2 dakika engelle
                                $stmt_block = $db->prepare("INSERT INTO rate_limits (identifier, type, expires_at) VALUES (?, 'login_block', NOW() + INTERVAL 2 MINUTE)");
                                $stmt_block->bind_param('s', $identifier);
                                $stmt_block->execute();
                                $stmt_block->close();
                                $response = ['status' => 'error', 'message' => 'Çok fazla hatalı deneme. 2 dakika engellendiniz.'];
                            } else {
                                $response = ['status' => 'error', 'message' => 'Kullanıcı adı veya şifre hatalı.'];
                            }
                        }
                    } else {
                        // Kullanıcı bulunamadı (Bunu da hatalı giriş olarak say)
                        $stmt_log = $db->prepare("INSERT INTO rate_limits (identifier, type) VALUES (?, 'login_fail')");
                        $stmt_log->bind_param('s', $identifier);
                        $stmt_log->execute();
                        $stmt_log->close();
                        
                        $response = ['status' => 'error', 'message' => 'Kullanıcı adı veya şifre hatalı.'];
                    }
                    $stmt->close();
                    break;
                
                default:
                    $response = ['status' => 'error', 'message' => 'Geçersiz eylem.'];
            }
        } catch (Exception $e) {
            error_log("API İşlem Hatası: " . $e->getMessage());
            $response = ['status' => 'error', 'message' => 'Sunucu tarafında bir hata oluştu.'];
        }
    } else {
         $response = ['status' => 'error', 'message' => 'Geçersiz veya şifresi çözülemeyen istek.'];
    }

    if ($isPublicAction) {
        $encryptedResponse = encryptPayload($response);
        echo json_encode(['r' => $encryptedResponse]);
        exit;
    }
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'UnAuthorized Access.']);
    exit;
}

try {
    $stmt_check = $db->prepare("SELECT id, erisim FROM users WHERE id = ?");
    $stmt_check->bind_param('i', $_SESSION['user_id']);
    $stmt_check->execute();
    $result_check = $stmt_check->get_result();
    
    if (!$user_check = $result_check->fetch_assoc() || $user_check['erisim'] != 1) {
        session_unset();
        session_destroy();
        
        http_response_code(401);
        echo json_encode(['error' => 'Oturum geçersiz veya hesap erişimi engellenmiş. Lütfen tekrar giriş yapın.']);
        exit;
    }
    $stmt_check->close();
} catch (Exception $e) {
    http_response_code(500);
    error_log("Oturum doğrulama hatası: " . $e->getMessage());
    echo json_encode(['error' => 'Oturum doğrulanırken sunucu hatası oluştu.']);
    exit;
}

function listCommands($dir) {
    if (!is_dir($dir)) return [];
    $files = scandir($dir);
    $commands = [];
    foreach ($files as $file) {
        if (str_ends_with($file, '_command.js')) {
            $commands[] = str_replace('_command.js', '', $file);
        }
    }
    return $commands;
}

function getCommandDescription($commandName, $dirs) {
    foreach ($dirs as $dir) {
        $filePath = $dir . '/' . $commandName . '_command.js';
        if (file_exists($filePath)) {
            $content = @file_get_contents($filePath);
            if ($content === false) continue;
            if (preg_match('/description:\s*[\'"](.*?)[\'"]/', $content, $matches)) {
                return trim($matches[1]);
            }
        }
    }
    return 'Komut açıklaması bulunamadı.';
}


function getSettings($db, $commandNames, $dirs) {
    $settings = [];
    try {
        $result = $db->query("SELECT command_name, is_enabled, allowed_roles, allowed_users, config, show_logpanel FROM command_settings");
        if (!$result) {
            error_log('Error fetching command settings: ' . $db->error);
            return [];
        }
        $dbSettings = [];
        while ($row = $result->fetch_assoc()) {
            $dbSettings[$row['command_name']] = [
                'is_enabled' => (bool)$row['is_enabled'],
                'allowed_roles' => json_decode($row['allowed_roles'] ?? '[]'),
                'allowed_users' => json_decode($row['allowed_users'] ?? '{}'),
                'config' => json_decode($row['config'] ?? '{}'),
                'show_logpanel' => isset($row['show_logpanel']) ? (bool)$row['show_logpanel'] : true
            ];
        }
        $result->free();

        foreach($commandNames as $name) {
            $settings[$name] = $dbSettings[$name] ?? ['is_enabled' => true, 'show_logpanel' => true, 'allowed_roles' => [], 'allowed_users' => (object)[], 'config' => (object)[]];
            $settings[$name]['description'] = getCommandDescription($name, $dirs);
        }
    } catch (Exception $e) {
        error_log("Error in getSettings: " . $e->getMessage());
        return [];
    }
    return $settings;
}

$allCommandNames = array_unique(array_merge(listCommands($slashCommandsDir), listCommands($prefixCommandsDir)));
$commandDirs = [$prefixCommandsDir, $slashCommandsDir];
$action = $_GET['action'] ?? null;
$name = $_GET['name'] ?? null;
$method = $_SERVER['REQUEST_METHOD'];


if ($action === 'get_guild_data') {
    if (file_exists($guildDataFile)) {
        readfile($guildDataFile);
    } else {
        echo json_encode(['guilds' => [], 'roles' => [], 'channels' => [], 'voiceChannels' => []]);
    }
    exit;
}

if ($action === 'get_guild_settings') {
    $settings = [];
    $result = $db->query("SELECT guild_id, config FROM guild_settings");
    if($result){
        while ($row = $result->fetch_assoc()) {
            $decodedConfig = json_decode($row['config'] ?? '{}');
            $settings[$row['guild_id']] = (json_last_error() === JSON_ERROR_NONE) ? $decodedConfig : (object)[];
        }
        $result->free();
    } else {
        error_log("Error fetching guild_settings: " . $db->error);
    }
    echo json_encode($settings);
    exit;
}

if ($action === 'save_guild_settings' && $method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $guild_id = $data['guild_id'] ?? null;
    $config_data = $data['config'] ?? [];
    $config_json = json_encode($config_data);
    if (json_last_error() !== JSON_ERROR_NONE) {
        echo json_encode(['error' => 'Geçersiz config verisi: ' . json_last_error_msg()]);
        exit;
    }
    if (!$guild_id) {
        echo json_encode(['error' => 'Guild ID eksik']);
        exit;
    }
    try {
        $stmt = $db->prepare("REPLACE INTO guild_settings (guild_id, config) VALUES (?, ?)");
        if (!$stmt) {
             throw new Exception('Prepare statement failed: ' . $db->error);
        }
        $stmt->bind_param('ss', $guild_id, $config_json);
        $stmt->execute();
        if ($stmt->error) {
             throw new Exception('Execute failed: ' . $stmt->error);
        }
        echo json_encode(['success' => true]);
        $stmt->close();
        @file_put_contents($syncTriggerFile, time());
    } catch (Exception $e) {
        error_log("Error saving guild settings (Guild: {$guild_id}): " . $e->getMessage());
        echo json_encode(['error' => 'Sunucu ayarları kaydedilirken bir hata oluştu.']);
    }
    exit;
}

// ... (api.php dosyasının geri kalanı, get_ses_log_users'dan itibaren...
// ... bu kısım olduğu gibi kalabilir, dokunulmadı) ...

if ($action === 'get_ses_log_users') {
    try {
        $result = $db->query("SELECT DISTINCT user_id, user_tag
                             FROM voice_logs
                             WHERE user_id IS NOT NULL AND user_tag IS NOT NULL
                             ORDER BY user_tag ASC");
        $users = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];
        echo json_encode(['users' => $users]);
    } catch (Exception $e) {
        error_log("Error fetching voice log users: " . $e->getMessage());
        echo json_encode(['error' => 'Ses logu kullanıcı listesi alınamadı.', 'users' => []]);
    }
    exit;
}

if ($action === 'get_ses_logs') {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = 10;
    $offset = ($page - 1) * $limit;
    $sort_order = ($_GET['sort'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';
    $user_id_filter = $_GET['user_id'] ?? null;

    $where_clause = 'WHERE 1=1';
    $params = [];
    $types = '';

    if (!empty($user_id_filter) && $user_id_filter !== 'all') {
        $where_clause .= ' AND user_id = ?';
        $params[] = $user_id_filter;
        $types .= 's';
    }

    try {
        // Total count
        $total_query = "SELECT COUNT(*) as total FROM voice_logs $where_clause";
        $total_stmt = $db->prepare($total_query);
        $total = 0;
        if ($total_stmt) {
            if (!empty($types)) $total_stmt->bind_param($types, ...$params);
            $total_stmt->execute();
            $total_result = $total_stmt->get_result();
            if ($total_result) $total = $total_result->fetch_assoc()['total'] ?? 0;
            $total_stmt->close();
        }
        $totalPages = $limit > 0 ? ceil($total / $limit) : 0;

        // Logs data
        $log_query = "SELECT id, guild_id, user_id, user_tag, user_avatar, channel_id, channel_name, event_type, user_mic_state, user_headphone_state, user_camera_state, members_list, timestamp
                      FROM voice_logs
                      $where_clause
                      ORDER BY timestamp $sort_order
                      LIMIT ? OFFSET ?";

        $log_params = $params; // Kopyala
        $log_params[] = $limit;
        $log_params[] = $offset;
        $log_types = $types . 'ii';

        $stmt = $db->prepare($log_query);
        $logs = [];
        if ($stmt) {
            if (!empty($log_types)) $stmt->bind_param($log_types, ...$log_params);
            $stmt->execute();
            $result = $stmt->get_result();
            if ($result) $logs = $result->fetch_all(MYSQLI_ASSOC);
            $stmt->close();
        }

        echo json_encode([
            'logs' => $logs,
            'pagination' => [
                'total_logs' => (int)$total,
                'total_pages' => (int)$totalPages,
                'current_page' => $page,
                'per_page' => $limit
            ]
        ]);

    } catch (Exception $e) {
        error_log("Error fetching voice logs: " . $e->getMessage());
        echo json_encode(['error' => 'Ses logları alınırken bir hata oluştu.']);
    }
    exit;
}


if ($action === 'get_log_users') {
    try {
        $result = $db->query("SELECT DISTINCT executor_id, executor_tag
                             FROM command_logs
                             WHERE executor_id IS NOT NULL AND executor_tag IS NOT NULL
                             ORDER BY executor_tag ASC");
        $users = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];
        echo json_encode(['users' => $users]);
    } catch (Exception $e) {
        error_log("Error fetching command log users: " . $e->getMessage());
        echo json_encode(['error' => 'Kullanıcı listesi alınamadı.', 'users' => []]);
    }
    exit;
}

if ($action === 'get_kes_log_users') {
    try {
        $result = $db->query("SELECT DISTINCT executor_id, executor_tag
                             FROM command_logs
                             WHERE executor_id IS NOT NULL AND executor_tag IS NOT NULL AND command_name = 'kes'
                             ORDER BY executor_tag ASC");
        $users = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];
        echo json_encode(['users' => $users]);
    } catch (Exception $e) {
        error_log("Error fetching 'kes' log users: " . $e->getMessage());
        echo json_encode(['error' => 'Kullanıcı listesi alınamadı.', 'users' => []]);
    }
    exit;
}

if ($action === 'get_ceza_users') {
    try {
        $result = $db->query("SELECT DISTINCT moderator_id, moderator_tag
                             FROM cezalar
                             WHERE moderator_id IS NOT NULL AND moderator_tag IS NOT NULL
                             ORDER BY moderator_tag ASC");
        $users = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];
        echo json_encode(['users' => $users]);
    } catch (Exception $e) {
         error_log("Error fetching ceza moderators: " . $e->getMessage());
        echo json_encode(['error' => 'Yetkili listesi alınamadı.', 'users' => []]);
    }
    exit;
}

if ($action === 'get_jail_moderators') {
    try {
        $result = $db->query("SELECT DISTINCT moderator_id, moderator_tag
                             FROM cezalar
                             WHERE moderator_id IS NOT NULL AND moderator_tag IS NOT NULL AND ceza_tipi = 'jail'
                             ORDER BY moderator_tag ASC");
        $users = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];
        echo json_encode(['users' => $users]);
    } catch (Exception $e) {
        error_log("Error fetching jail moderators: " . $e->getMessage());
        echo json_encode(['error' => 'Jail yetkili listesi alınamadı.', 'users' => []]);
    }
    exit;
}

if ($action === 'get_uyari_moderators') {
    try {
        $result = $db->query("SELECT DISTINCT moderator_id, moderator_tag
                             FROM cezalar
                             WHERE moderator_id IS NOT NULL AND moderator_tag IS NOT NULL AND ceza_tipi IN ('uyari1', 'uyari2')
                             ORDER BY moderator_tag ASC");
        $users = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];
        echo json_encode(['users' => $users]);
    } catch (Exception $e) {
        error_log("Error fetching uyari moderators: " . $e->getMessage());
        echo json_encode(['error' => 'Uyarı yetkili listesi alınamadı.', 'users' => []]);
    }
    exit;
}


if ($action === 'get_af_log_moderators') {
    try {
        $result = $db->query("SELECT DISTINCT moderator_id, moderator_tag
                             FROM ceza_af_logs
                             WHERE moderator_id IS NOT NULL AND moderator_tag IS NOT NULL
                             ORDER BY moderator_tag ASC");
        $users = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];
        echo json_encode(['users' => $users]);
    } catch (Exception $e) {
        error_log("Error fetching af log moderators: " . $e->getMessage());
        echo json_encode(['error' => 'Af logu moderatör listesi alınamadı.', 'users' => []]);
    }
    exit;
}

if ($action === 'get_af_logs') {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = 10;
    $offset = ($page - 1) * $limit;
    $sort_order = ($_GET['sort'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';
    $moderator_id_filter = $_GET['moderator_id'] ?? null;

    $where_clause = 'WHERE 1=1';
    $params = [];
    $types = '';

    if (!empty($moderator_id_filter) && $moderator_id_filter !== 'all') {
        $where_clause .= ' AND moderator_id = ?';
        $params[] = $moderator_id_filter;
        $types .= 's';
    }

    try {
        // Total count
        $total_query = "SELECT COUNT(*) as total FROM ceza_af_logs $where_clause";
        $total_stmt = $db->prepare($total_query);
        $total = 0;
        if($total_stmt){
            if (!empty($types)) $total_stmt->bind_param($types, ...$params);
            $total_stmt->execute();
            $total_result = $total_stmt->get_result();
            if ($total_result) $total = $total_result->fetch_assoc()['total'] ?? 0;
            $total_stmt->close();
        }
        $totalPages = $limit > 0 ? ceil($total / $limit) : 0;

        // Logs data
        $log_query = "SELECT id, original_ceza_id, user_id, user_tag, user_avatar, moderator_id, moderator_tag, moderator_avatar, ceza_tipi, original_sebep, forgive_timestamp
                      FROM ceza_af_logs
                      $where_clause
                      ORDER BY forgive_timestamp $sort_order
                      LIMIT ? OFFSET ?";

        $log_params = $params;
        $log_params[] = $limit;
        $log_params[] = $offset;
        $log_types = $types . 'ii';

        $stmt = $db->prepare($log_query);
        $logs = [];
        if($stmt){
            if (!empty($log_types)) $stmt->bind_param($log_types, ...$log_params);
            $stmt->execute();
            $result = $stmt->get_result();
            if ($result) $logs = $result->fetch_all(MYSQLI_ASSOC);
            $stmt->close();
        }

        echo json_encode([
            'logs' => $logs,
            'pagination' => [
                'total_logs' => (int)$total,
                'total_pages' => (int)$totalPages,
                'current_page' => $page,
                'per_page' => $limit
            ]
        ]);

    } catch (Exception $e) {
        error_log("Error fetching af logs: " . $e->getMessage());
        echo json_encode(['error' => 'Af logları alınırken bir hata oluştu.']);
    }
    exit;
}

if ($action === 'get_kayit_moderators') {
    try {
        $result = $db->query("SELECT DISTINCT moderator_id, moderator_tag
                             FROM registrations
                             WHERE moderator_id IS NOT NULL AND moderator_tag IS NOT NULL
                             ORDER BY moderator_tag ASC");
        $users = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];
        echo json_encode(['users' => $users]);
    } catch (Exception $e) {
        error_log("Error fetching kayit moderators: " . $e->getMessage());
        echo json_encode(['error' => 'Kaydeden yetkili listesi alınamadı.', 'users' => []]);
    }
    exit;
}

if ($action === 'get_kayit_logs') {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = 10;
    $offset = ($page - 1) * $limit;
    $sort_order = ($_GET['sort'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';
    $moderator_id_filter = $_GET['moderator_id'] ?? null;

    $where_clause = 'WHERE 1=1';
    $params = [];
    $types = '';

    if (!empty($moderator_id_filter) && $moderator_id_filter !== 'all') {
        $where_clause .= ' AND moderator_id = ?';
        $params[] = $moderator_id_filter;
        $types .= 's';
    }

    try {
        // Total count
        $total_query = "SELECT COUNT(*) as total FROM registrations $where_clause";
        $total_stmt = $db->prepare($total_query);
        $total = 0;
        if($total_stmt){
            if (!empty($types)) $total_stmt->bind_param($types, ...$params);
            $total_stmt->execute();
            $total_result = $total_stmt->get_result();
            if($total_result) $total = $total_result->fetch_assoc()['total'] ?? 0;
            $total_stmt->close();
        }
        $totalPages = $limit > 0 ? ceil($total / $limit) : 0;

        // Logs data
        $log_query = "SELECT id, guild_id, user_id, user_tag, user_avatar, moderator_id, moderator_tag, moderator_avatar, new_nickname, gender, timestamp
                      FROM registrations
                      $where_clause
                      ORDER BY id $sort_order
                      LIMIT ? OFFSET ?";

        $log_params = $params;
        $log_params[] = $limit;
        $log_params[] = $offset;
        $log_types = $types . 'ii';

        $stmt = $db->prepare($log_query);
        $logs = [];
        if($stmt){
            if (!empty($log_types)) $stmt->bind_param($log_types, ...$log_params);
            $stmt->execute();
            $result = $stmt->get_result();
            if($result) $logs = $result->fetch_all(MYSQLI_ASSOC);
            $stmt->close();
        }

        echo json_encode([
            'logs' => $logs,
            'pagination' => [
                'total_logs' => (int)$total,
                'total_pages' => (int)$totalPages,
                'current_page' => $page,
                'per_page' => $limit
            ]
        ]);

    } catch (Exception $e) {
        error_log("Error fetching kayit logs: " . $e->getMessage());
        echo json_encode(['error' => 'Kayıt logları alınırken bir hata oluştu.']);
    }
    exit;
}


if ($action === 'get_ceza_logs') {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = 10;
    $offset = ($page - 1) * $limit;
    $sort_order = ($_GET['sort'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';
    $ceza_tipi_filter = $_GET['tipi'] ?? null;
    $moderator_id_filter = $_GET['moderator_id'] ?? null;

    $where_clause = 'WHERE 1=1';
    $params = [];
    $types = '';

    if (!empty($ceza_tipi_filter) && $ceza_tipi_filter !== 'all') {
        $tipler = explode(',', $ceza_tipi_filter);
        if(!empty($tipler)){
            $placeholders = implode(',', array_fill(0, count($tipler), '?'));
            $where_clause .= " AND ceza_tipi IN ($placeholders)";
            $params = array_merge($params, $tipler);
            $types .= str_repeat('s', count($tipler));
        }
    }

    if (!empty($moderator_id_filter) && $moderator_id_filter !== 'all') {
        $where_clause .= ' AND moderator_id = ?';
        $params[] = $moderator_id_filter;
        $types .= 's';
    }


    try {
        // Total count
        $total_query = "SELECT COUNT(*) as total FROM cezalar $where_clause";
        $total_stmt = $db->prepare($total_query);
        $total = 0;
        if($total_stmt){
            if (!empty($types)) $total_stmt->bind_param($types, ...$params);
            $total_stmt->execute();
            $total_result = $total_stmt->get_result();
            if($total_result) $total = $total_result->fetch_assoc()['total'] ?? 0;
            $total_stmt->close();
        }
        $totalPages = $limit > 0 ? ceil($total / $limit) : 0;

        // Logs data
        $log_query = "SELECT id, guild_id, user_id, user_tag, user_avatar, moderator_id, moderator_tag, moderator_avatar, ceza_tipi, sebep, baslangic_tarihi, bitis_tarihi, aktif, channel_id
                      FROM cezalar
                      $where_clause
                      ORDER BY id $sort_order
                      LIMIT ? OFFSET ?";

        $log_params = $params;
        $log_params[] = $limit;
        $log_params[] = $offset;
        $log_types = $types . 'ii';

        $stmt = $db->prepare($log_query);
        $logs = [];
        if($stmt){
            if (!empty($log_types)) $stmt->bind_param($log_types, ...$log_params);
            $stmt->execute();
            $result = $stmt->get_result();
            if($result) $logs = $result->fetch_all(MYSQLI_ASSOC);
            $stmt->close();
        }

        echo json_encode([
            'logs' => $logs,
            'pagination' => [
                'total_logs' => (int)$total,
                'total_pages' => (int)$totalPages,
                'current_page' => $page,
                'per_page' => $limit
            ]
        ]);

    } catch (Exception $e) {
        error_log("Error fetching ceza logs: " . $e->getMessage());
        echo json_encode(['error' => 'Ceza logları alınırken bir hata oluştu.']);
    }
    exit;
}

if ($action === 'get_uyari_logs') {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = 10;
    $offset = ($page - 1) * $limit;
    $sort_order = ($_GET['sort'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';
    $ceza_tipi_filter = $_GET['tipi'] ?? 'uyari1,uyari2';
    $moderator_id_filter = $_GET['moderator_id'] ?? null;

    $where_clause = 'WHERE 1=1';
    $params = [];
    $types = '';

    if (!empty($ceza_tipi_filter)) {
        if ($ceza_tipi_filter === 'all' || $ceza_tipi_filter === 'uyari1,uyari2') {
             $where_clause .= " AND ceza_tipi IN ('uyari1', 'uyari2')";
        } else {
            $tipler = explode(',', $ceza_tipi_filter);
            $valid_tipler = array_filter($tipler, function($t) { return $t === 'uyari1' || $t === 'uyari2'; });
            if (count($valid_tipler) > 0) {
                $placeholders = implode(',', array_fill(0, count($valid_tipler), '?'));
                $where_clause .= " AND ceza_tipi IN ($placeholders)";
                $params = array_merge($params, $valid_tipler);
                $types .= str_repeat('s', count($valid_tipler));
            } else {
                 $where_clause .= " AND 1=0"; // Geçersiz tip
            }
        }
    } else {
         $where_clause .= " AND ceza_tipi IN ('uyari1', 'uyari2')"; // Tip belirtilmezse uyarıları getir
    }


    if (!empty($moderator_id_filter) && $moderator_id_filter !== 'all') {
        $where_clause .= ' AND moderator_id = ?';
        $params[] = $moderator_id_filter;
        $types .= 's';
    }


    try {
        // Total count
        $total_query = "SELECT COUNT(*) as total FROM cezalar $where_clause";
        $total_stmt = $db->prepare($total_query);
        $total = 0;
        if($total_stmt){
            if (!empty($types)) $total_stmt->bind_param($types, ...$params);
            $total_stmt->execute();
            $total_result = $total_stmt->get_result();
            if($total_result) $total = $total_result->fetch_assoc()['total'] ?? 0;
            $total_stmt->close();
        }
        $totalPages = $limit > 0 ? ceil($total / $limit) : 0;

        // Logs data
        $log_query = "SELECT id, guild_id, user_id, user_tag, user_avatar, moderator_id, moderator_tag, moderator_avatar, ceza_tipi, sebep, baslangic_tarihi, aktif
                      FROM cezalar
                      $where_clause
                      ORDER BY id $sort_order
                      LIMIT ? OFFSET ?";

        $log_params = $params;
        $log_params[] = $limit;
        $log_params[] = $offset;
        $log_types = $types . 'ii';

        $stmt = $db->prepare($log_query);
        $logs = [];
        if($stmt){
            if (!empty($log_types)) $stmt->bind_param($log_types, ...$log_params);
            $stmt->execute();
            $result = $stmt->get_result();
            if($result) $logs = $result->fetch_all(MYSQLI_ASSOC);
            $stmt->close();
        }

        echo json_encode([
            'logs' => $logs,
            'pagination' => [
                'total_logs' => (int)$total,
                'total_pages' => (int)$totalPages,
                'current_page' => $page,
                'per_page' => $limit
            ]
        ]);

    } catch (Exception $e) {
        error_log("Error fetching uyari logs: " . $e->getMessage());
        echo json_encode(['error' => 'Uyarı logları alınırken bir hata oluştu.']);
    }
    exit;
}


if ($action === 'get_logs') {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = 10;
    $offset = ($page - 1) * $limit;
    $sort_order = ($_GET['sort'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';
    $executor_id = $_GET['executor_id'] ?? null;

    $where_clause = ' WHERE 1=1';
    $params = [];
    $types = '';

    if (!empty($executor_id) && $executor_id !== 'all') {
        $where_clause = ' WHERE executor_id = ?';
        $params[] = $executor_id;
        $types .= 's';
    }

    try {
        // Total count
        $total_query = "SELECT COUNT(*) as total FROM command_logs $where_clause";
        $total_stmt = $db->prepare($total_query);
        $total = 0;
        if($total_stmt){
            if (!empty($types)) $total_stmt->bind_param($types, ...$params);
            $total_stmt->execute();
            $total_result = $total_stmt->get_result();
            if($total_result) $total = $total_result->fetch_assoc()['total'] ?? 0;
            $total_stmt->close();
        }
        $totalPages = $limit > 0 ? ceil($total / $limit) : 0;

        // Logs data
        $log_query = "SELECT id, command_name, executor_id, executor_tag, executor_avatar, target_id, target_tag, target_avatar, status, timestamp
                      FROM command_logs
                      $where_clause
                      ORDER BY id $sort_order
                      LIMIT ? OFFSET ?";

        $log_params = $params;
        $log_params[] = $limit;
        $log_params[] = $offset;
        $log_types = $types . 'ii';

        $stmt = $db->prepare($log_query);
        $logs = [];
        if($stmt){
             if (!empty($log_types)) $stmt->bind_param($log_types, ...$log_params);
             $stmt->execute();
             $result = $stmt->get_result();
             if($result) $logs = $result->fetch_all(MYSQLI_ASSOC);
             $stmt->close();
        }

        echo json_encode([
            'logs' => $logs,
            'pagination' => [
                'total_logs' => (int)$total,
                'total_pages' => (int)$totalPages,
                'current_page' => $page,
                'per_page' => $limit
            ]
        ]);

    } catch (Exception $e) {
        error_log("Error fetching command logs: " . $e->getMessage());
        echo json_encode(['error' => 'Komut logları alınırken bir hata oluştu.']);
    }
    exit;
}

if ($action === 'get_kes_logs') {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = 10;
    $offset = ($page - 1) * $limit;
    $sort_order = ($_GET['sort'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';
    $executor_id = $_GET['executor_id'] ?? null;

    $where_clause = " WHERE command_name = 'kes'";
    $params = [];
    $types = '';

    if (!empty($executor_id) && $executor_id !== 'all') {
        $where_clause .= ' AND executor_id = ?';
        $params[] = $executor_id;
        $types .= 's';
    }

    try {
        // Total count
        $total_query = "SELECT COUNT(*) as total FROM command_logs $where_clause";
        $total_stmt = $db->prepare($total_query);
        $total = 0;
        if($total_stmt){
            if (!empty($types)) $total_stmt->bind_param($types, ...$params);
            $total_stmt->execute();
            $total_result = $total_stmt->get_result();
            if($total_result) $total = $total_result->fetch_assoc()['total'] ?? 0;
            $total_stmt->close();
        }
        $totalPages = $limit > 0 ? ceil($total / $limit) : 0;

        // Logs data
        $log_query = "SELECT id, command_name, executor_id, executor_tag, executor_avatar, target_id, target_tag, target_avatar, status, timestamp
                      FROM command_logs
                      $where_clause
                      ORDER BY id $sort_order
                      LIMIT ? OFFSET ?";

        $log_params = $params;
        $log_params[] = $limit;
        $log_params[] = $offset;
        $log_types = $types . 'ii';

        $stmt = $db->prepare($log_query);
        $logs = [];
        if($stmt){
            if (!empty($log_types)) $stmt->bind_param($log_types, ...$log_params);
            $stmt->execute();
            $result = $stmt->get_result();
            if($result) $logs = $result->fetch_all(MYSQLI_ASSOC);
            $stmt->close();
        }

        echo json_encode([
            'logs' => $logs,
            'pagination' => [
                'total_logs' => (int)$total,
                'total_pages' => (int)$totalPages,
                'current_page' => $page,
                'per_page' => $limit
            ]
        ]);

    } catch (Exception $e) {
        error_log("Error fetching 'kes' logs: " . $e->getMessage());
        echo json_encode(['error' => 'Kes logları alınırken bir hata oluştu.']);
    }
    exit;
}


if ($action === 'search_users') {
    $guildId = $_GET['guild_id'] ?? null;
    $query = $_GET['query'] ?? '';
    $page = max(1, (int)($_GET['page'] ?? 1));

    if (!$guildId || !$query) {
        echo json_encode(['error' => 'Guild ID and query are required']);
        exit;
    }

    $botApiUrl = $_ENV['BOT_API_URL'] ?? null;
    if (!$botApiUrl) {
         echo json_encode(['error' => "BOT_API_URL ortam değişkeni ayarlanmamış."]);
         exit;
    }

    $url = rtrim($botApiUrl, '/') . "/search_users?" . http_build_query([
        'guild_id' => $guildId,
        'query' => $query,
        'page' => $page
    ]);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 7);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);

    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_error = curl_error($ch);
    $curl_errno = curl_errno($ch);
    curl_close($ch);

    if ($response === false) {
        error_log("Bot API Curl Error ({$url}): [{$curl_errno}] {$curl_error}");
        echo json_encode(['error' => "Bot API'sine ulaşılamadı. Lütfen botun çalıştığından ve BOT_API_URL'nin doğru olduğundan emin olun."]);
    } else if ($http_code >= 400) {
        error_log("Bot API HTTP Error ({$url}): Code {$http_code}, Response: {$response}");
        $errorData = json_decode($response, true);
        $errorMessage = $errorData['error'] ?? $response;
        echo json_encode(['error' => "Bot API hatası (HTTP {$http_code}): " . $errorMessage]);
    } else {
        echo $response;
    }
    exit;
}

if ($action && $name && in_array($name, $allCommandNames)) {
    if ($action === 'save_permissions' && $method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        if ($data === null) {
            echo json_encode(['error' => 'Geçersiz JSON verisi']);
            exit;
        }

        $roles_json = json_encode($data['roles'] ?? []);
        $users_json = json_encode($data['users'] ?? (object)[]);
        $config_json = json_encode($data['config'] ?? (object)[]);

        if (json_last_error() !== JSON_ERROR_NONE) {
            echo json_encode(['error' => 'Veri formatı hatası: ' . json_last_error_msg()]);
            exit;
        }


        try {
            $stmt = $db->prepare("UPDATE command_settings SET allowed_roles = ?, allowed_users = ?, config = ? WHERE command_name = ?");
             if (!$stmt) {
                 throw new Exception('Prepare statement failed: ' . $db->error);
            }
            $stmt->bind_param('ssss', $roles_json, $users_json, $config_json, $name);
            $stmt->execute();
            if ($stmt->error) {
                throw new Exception('Execute failed: ' . $stmt->error);
            }
            echo json_encode(['success' => true]);
            $stmt->close();
            @file_put_contents($syncTriggerFile, time());
        } catch (Exception $e) {
            error_log("Error saving command permissions ({$name}): " . $e->getMessage());
            echo json_encode(['error' => 'Komut ayarları kaydedilirken bir hata oluştu.']);
        }
        exit;
    }

    if ($method === 'GET') {
        switch ($action) {
            case 'toggle':
                try {
                    $select_stmt = $db->prepare("SELECT is_enabled FROM command_settings WHERE command_name = ?");
                    $current_status = null;
                    if($select_stmt){
                        $select_stmt->bind_param('s', $name);
                        $select_stmt->execute();
                        $resData = $select_stmt->get_result();
                        if($resData) $current_status = $resData->fetch_assoc()['is_enabled'] ?? null;
                        $select_stmt->close();
                    }

                    if($current_status === null) {
                         echo json_encode(['error' => 'Komut bulunamadı veya durumu alınamadı.']);
                         exit;
                    }

                    $new_status = !$current_status;
                    $update_stmt = $db->prepare("UPDATE command_settings SET is_enabled = ? WHERE command_name = ?");
                    if ($update_stmt) {
                        $update_stmt->bind_param('is', $new_status, $name);
                        $update_stmt->execute();
                        if ($update_stmt->error) throw new Exception($update_stmt->error);
                        $update_stmt->close();
                        @file_put_contents($syncTriggerFile, time());
                        echo json_encode(['success' => true, 'status' => (bool)$new_status]);
                    } else {
                         throw new Exception('Prepare failed: ' . $db->error);
                    }
                } catch (Exception $e) {
                     error_log("Error toggling command ({$name}): " . $e->getMessage());
                     echo json_encode(['error' => 'Komut durumu güncellenirken bir hata oluştu.']);
                }
                break;
            default:
                echo json_encode(['error' => 'Geçersiz işlem']);
        }
        exit;
    } else {
         echo json_encode(['error' => 'Desteklenmeyen istek metodu']);
         exit;
    }
} elseif ($action && $name && !in_array($name, $allCommandNames)) {
     echo json_encode(['error' => 'Geçersiz komut adı']);
     exit;
}

echo json_encode([
    'commands' => $allCommandNames,
    'settings' => getSettings($db, $allCommandNames, $commandDirs)
]);
?>

