<?php
session_start();

function getDbAuthCheck() {
    static $db_auth = null;
    if ($db_auth === null) {
        try {
            require_once __DIR__ . '/../vendor/autoload.php';
            $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
            $dotenv->load();

            mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
            $db_auth = new mysqli($_ENV['DB_HOST'], $_ENV['DB_USER'], $_ENV['DB_PASS'], $_ENV['DB_NAME']);
            $db_auth->set_charset('utf8mb4');
        } catch (Exception $e) {
            error_log("Auth Check DB connection failed: " . $e->getMessage());
            return null;
        }
    }
    return $db_auth;
}

$isAuthenticated = false;

if (isset($_SESSION['user_id'])) {
    $db_auth_check = getDbAuthCheck();
    if ($db_auth_check) {
        try {
            $stmt_check = $db_auth_check->prepare("SELECT erisim FROM users WHERE id = ?");
            $stmt_check->bind_param('i', $_SESSION['user_id']);
            $stmt_check->execute();
            $result_check = $stmt_check->get_result();
            
            if ($user_check = $result_check->fetch_assoc()) {
                if ($user_check['erisim'] == 1) {
                    $isAuthenticated = true;
                }
            }
            $stmt_check->close();
        } catch (Exception $e) {
            error_log("Auth Check DB query failed: " . $e->getMessage());
        }
    }
}

if (!$isAuthenticated) {
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_unset();
        session_destroy();
    }
    header('Location: ../login.html?reason=unauthorized');
    exit;
}
?>
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ses Hareket Logları</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" rel="stylesheet">
<link rel="stylesheet" href="../web_css/logs.css">
<style>
    .event-badge {
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        margin-left: 10px;
        display: inline-block;
    }
    .event-join { color: var(--status-success); background: rgba(67, 181, 129, 0.1); border: 1px solid var(--status-success); }
    .event-leave { color: var(--status-fail); background: rgba(240, 71, 71, 0.1); border: 1px solid var(--status-fail); }
    .log-channel { color: var(--interactive-hover); font-weight: 500;}

    .komut-log-card .komut-detail-label {
        width: 180px;
        flex-shrink: 0;
     }
     .komut-log-card .komut-detail-value {
        white-space: normal;
        word-break: break-word;
     }

     .members-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 8px;
        margin-top: 5px;
        padding-left: 5px;
        max-height: 200px;
        overflow-y: auto;
        background-color: var(--background-primary);
        border-radius: 4px;
        padding: 8px;
     }
     .member-item {
        display: flex;
        align-items: center;
        gap: 8px;
        background-color: var(--background-secondary);
        padding: 5px;
        border-radius: 3px;
        overflow: hidden;
     }
     .member-avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        flex-shrink: 0;
     }
     .member-details {
        display: flex;
        flex-direction: column;
        line-height: 1.2;
        min-width: 0;
     }
     .member-name {
        font-size: 13px;
        color: var(--header-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
     }
     .member-id {
        font-size: 11px;
        color: var(--text-muted);
        cursor: pointer;
        transition: color 0.2s ease;
     }
      .member-id:hover {
        color: var(--interactive-hover);
     }
     .member-id.copied {
         color: var(--status-success);
         font-weight: bold;
     }

</style>
</head>
<body>

<div class="sidebar" id="sidebar">
    <div class="sidebar-header">
        <h2>M E B S U T A</h2>
    </div>
    <nav class="sidebar-nav">
        <a href="../index.php">
            <span class="material-icons-outlined">apps</span>
            Komutlar
        </a>
        <div class="nav-category">
            <div class="nav-category-toggle active">
                <span class="material-icons-outlined">receipt_long</span>
                <span>Loglar</span>
                <span class="material-icons-outlined dropdown-icon">expand_more</span>
            </div>
            <div class="submenu show">
                <a href="cezalar.php">
                    <span class="material-icons-outlined">gavel</span>
                    Cezalar
                </a>
                <a href="muteler.php">
                <span class="material-icons-outlined">mic_off</span>
                    Muteler
                </a>
                <a href="kayit_logs.php">
                    <span class="material-icons-outlined">person_add</span>
                    Kayıtlar
                </a>
                <a href="index.php">
                    <span class="material-icons-outlined">code</span>
                    Komut Logları
                </a>
                <a href="uyari_log.php">
                    <span class="material-icons-outlined">warning</span>
                    Uyarı Logları
                </a>
                <a href="voice-logs.php">
                    <span class="material-icons-outlined">volume_up</span>
                    Ses Logları
                </a>
                <a href="voice-keslog.php">
                    <span class="material-icons-outlined">phone_disabled</span>
                    Ses Kesme Logları
                </a>
                 <a href="ceza_af.php">
                    <span class="material-icons-outlined">lock_open</span>
                    Af Logları
                </a>
            </div>
        </div>
    </nav>
</div>

<div class="page-overlay" id="overlay"></div>
<div class="hamburger-menu" id="hamburgerMenu">
    <span class="material-icons-outlined">menu</span>
</div>

<div class="main-content">
    <h1>Ses Hareket Logları</h1>

    <div class="filters">
        <div class="filter-group">
            <label for="userFilter">Kullanıcı:</label>
            <select id="userFilter" class="filter-select">
                <option value="all">Tüm Kullanıcılar</option>
            </select>
        </div>
        <div class="filter-group">
            <label for="sortFilter">Sıralama:</label>
            <select id="sortFilter" class="filter-select">
                <option value="DESC">Yeniden Eskiye (Zamana Göre)</option>
                <option value="ASC">Eskiden Yeniye (Zamana Göre)</option>
            </select>
        </div>
    </div>

    <div class="container">
        <div id="logList">
            <div class="spinner"></div>
        </div>
    </div>

    <div id="pagination"></div>
</div>

<div id="toast"></div>

<script src="../web_js/sidebar.js"></script>
<script src="js/ses-loglari.js"></script>

</body>
</html>
