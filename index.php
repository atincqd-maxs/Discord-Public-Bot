<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Yönetim Paneli - Komutlar</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" rel="stylesheet">
<link rel="stylesheet" href="web_css/logs.css">
<!-- YENİ: Oturum Kontrolü -->
<script>
    // Bu script, <head> içinde en üstte olmalı.
    // Kullanıcının giriş yapıp yapmadığını kontrol eder.
    if (sessionStorage.getItem('isLoggedIn') !== 'true') {
        // Giriş yapılmamışsa, login sayfasına yönlendir.
        window.location.href = 'login.html';
    }
</script>
<!-- YENİ: Oturum Kontrolü Bitiş -->
<style>
    :root {
        --background-primary: #36393f;
        --background-secondary: #2f3136;
        --background-tertiary: #202225;
        --header-primary: #ffffff;
        --header-secondary: #b9bbbe;
        --text-normal: #dcddde;
        --text-muted: #72767d;
        --brand-experiment: #5865f2;
        --status-success: #43b581;
        --status-fail: #f04747;
        --interactive-hover: #ddd;
        --interactive-active: #fff;
        --background-modifier-accent: #4f545c;
        --sidebar-width: 240px;
    }
    body {
        margin: 0;
        font-family: 'Noto Sans', sans-serif;
        background-color: var(--background-primary);
        color: var(--text-normal);
        display: flex;
    }
    .sidebar {
        width: var(--sidebar-width);
        height: 100vh;
        background-color: var(--background-secondary);
        position: fixed;
        left: 0;
        top: 0;
        display: flex;
        flex-direction: column;
        z-index: 1001;
        transition: transform 0.3s ease;
    }
    .sidebar-header {
        padding: 20px;
        text-align: center;
        border-bottom: 1px solid var(--background-tertiary);
    }
    .sidebar-header h2 {
        margin: 0;
        color: var(--header-primary);
        font-size: 1.2em;
    }
    .sidebar-nav {
        flex-grow: 1;
        overflow-y: auto;
        padding: 15px 0;
    }
    .sidebar-nav a, .nav-category-toggle {
        display: flex;
        align-items: center;
        padding: 12px 20px;
        color: var(--header-secondary);
        text-decoration: none;
        font-size: 15px;
        font-weight: 500;
        border-radius: 5px;
        margin: 3px 10px;
        transition: background-color 0.2s, color 0.2s;
    }
     .sidebar-nav a:hover, .nav-category-toggle:hover {
        background-color: var(--background-modifier-accent);
        color: var(--interactive-hover);
    }
     .sidebar-nav a.active {
        background-color: var(--brand-experiment);
        color: white;
    }
     .sidebar-nav a .material-icons-outlined,
     .nav-category-toggle .material-icons-outlined {
        margin-right: 15px;
        font-size: 22px;
    }
    .nav-category { margin: 3px 10px; }
    .nav-category-toggle {
        cursor: pointer;
        justify-content: space-between;
        margin: 0;
    }
    .nav-category-toggle span:first-of-type {
        margin-right: 15px;
    }
     .nav-category-toggle .dropdown-icon {
        margin-right: 0;
        transition: transform 0.3s ease;
        font-size: 20px;
     }
     .nav-category.open .dropdown-icon {
        transform: rotate(180deg);
     }
    .submenu {
        display: none;
        padding-left: 10px;
        margin-top: 5px;
    }
     .nav-category.open .submenu {
        display: block;
     }
     .submenu a {
        padding-left: 30px; /* Adjust based on icon size + margin */
        font-size: 14px;
        margin: 1px 0;
     }
     .submenu a .material-icons-outlined {
        margin-left: -20px; /* Adjust to align icon */
        margin-right: 10px;
        font-size: 20px;
     }

    .hamburger-menu {
        display: none;
        position: fixed;
        top: 15px;
        left: 15px;
        z-index: 1002;
        cursor: pointer;
        background: rgba(47, 49, 54, 0.8);
        padding: 8px;
        border-radius: 50%;
    }
    .hamburger-menu .material-icons-outlined {
        color: white;
        font-size: 28px;
    }
    .page-overlay {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 1000;
    }

    /* YENİ: Çıkış yap butonu için stil */
    .sidebar-nav a#logoutButton:hover {
        background-color: var(--status-fail);
        color: white;
    }
    /* YENİ BİTİŞ */

    .main-content { max-width: 1000px; margin: auto; margin-left: var(--sidebar-width); padding: 30px; transition: margin-left 0.3s ease; width: calc(100% - var(--sidebar-width) - 60px); box-sizing: border-box; }
    #commandList { display: flex; flex-direction: column; gap: 15px; }
    .command-category-header { color: var(--header-secondary); font-size: 16px; font-weight: 700; margin-top: 25px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--background-tertiary); }
    #commandList .command-category-header:first-of-type { margin-top: 0; }
    .command-item { background: var(--background-secondary); border-radius: 8px; border: 1px solid var(--background-tertiary); padding: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
    .command-info h3 { margin: 0 0 5px 0; color: var(--header-primary); }
    .command-info p { margin: 0; color: var(--text-normal); font-size: 14px; }
    .command-actions { display: flex; align-items: center; gap: 20px; flex-shrink: 0; }
    .btn { padding: 10px 16px; border: none; border-radius: 5px; cursor: pointer; font-weight: 600; font-size: 14px; transition: background-color 0.2s ease; }
    .btn:disabled { cursor: not-allowed; opacity: 0.6; }
    .btn-settings { background-color: var(--brand-experiment); color: white; }
    .btn-settings:hover:not(:disabled) { background-color: #4a54c4; }
    .switch-wrapper { display: flex; align-items: center; gap: 10px; }
    .switch-label { font-size: 14px; font-weight: 500; color: var(--text-muted); }
    .switch-label.on { color: var(--status-success); }
    .switch-container { position: relative; display: inline-block; width: 44px; height: 24px; }
    .switch-container input { opacity: 0; width: 0; height: 0; }
    .switch-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--background-modifier-accent); border-radius: 24px; transition: .4s; }
    .switch-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; border-radius: 50%; transition: .4s; }
    input:checked + .switch-slider { background-color: var(--status-success); }
    input:checked + .switch-slider:before { transform: translateX(20px); }

    .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.6); justify-content: center; align-items: center; }
    .modal.show { display: flex; }
    .modal-content { background-color: var(--background-secondary); margin: auto; border-radius: 8px; width: 90%; max-width: 900px; display: flex; flex-direction: column; max-height: 90vh; border: 1px solid var(--background-tertiary); }
    .modal-header { padding: 20px 25px; border-bottom: 1px solid var(--background-tertiary); display: flex; justify-content: space-between; align-items: center; }
    .modal-header h2 { margin: 0; color: var(--header-primary); }
    .modal-header .close-btn { background: none; border: none; font-size: 28px; color: var(--text-muted); cursor: pointer; line-height: 1; padding: 0; }
    .modal-body { display: flex; min-height: 500px; max-height: calc(90vh - 130px); /* header ve footer yüksekliğini çıkar */ }
    .guild-list-container { width: 220px; background: var(--background-tertiary); padding: 15px; border-right: 1px solid var(--background-tertiary); overflow-y: auto; flex-shrink: 0; }
    .guild-item { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 6px; cursor: pointer; margin-bottom: 5px; }
    .guild-item:hover { background: var(--background-primary); }
    .guild-item.selected { background: var(--brand-experiment); color: white; }
    .guild-item img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
    .guild-item span { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .modal-main-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .tab-bar { display: flex; padding: 0px 20px; border-bottom: 1px solid var(--background-tertiary); flex-shrink: 0; }
    .tab-button { background: none; border: none; color: var(--text-muted); padding: 15px 15px; cursor: pointer; font-size: 15px; font-weight: 600; border-bottom: 2px solid transparent; margin-bottom: -1px; }
    .tab-button.active { color: var(--header-primary); border-bottom-color: var(--brand-experiment); }
    .tab-content { display: none; flex-grow: 1; overflow-y: auto; }
    .tab-content.active { display: block; }
    .guild-header { padding: 15px 20px; background: var(--background-primary); border-bottom: 1px solid var(--background-tertiary); font-weight: 600; color: var(--header-secondary); flex-shrink: 0; }
    .content-body { display: flex; flex-direction: column; padding: 20px; }
    .content-split { display: flex; gap: 20px; }
    .content-split > div { flex: 1; }
    .search-bar { margin-bottom: 15px; }
    .search-input { width: 100%; background: var(--background-tertiary); border: 1px solid var(--background-tertiary); border-radius: 4px; padding: 10px; color: var(--text-normal); box-sizing: border-box; }
    .role-list-container { max-height: 350px; overflow-y: auto; background: var(--background-primary); border-radius: 5px; padding: 10px; border: 1px solid var(--background-tertiary); }
    .role-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 4px; cursor: pointer; margin-bottom: 2px; }
    .role-item:hover { background: var(--background-secondary); }
    .role-item.selected { background: var(--brand-experiment); color: white; }
    .role-item .checkbox { width: 18px; height: 18px; border: 2px solid var(--text-muted); border-radius: 4px; text-align: center; line-height: 16px; font-weight: bold; flex-shrink: 0; }
    .role-item.selected .checkbox { background: white; color: var(--brand-experiment); border-color: white; }
    .role-color { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
    .role-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .role-id { font-size: 12px; color: var(--text-muted); margin-left: auto; flex-shrink: 0; }
    .role-item.selected .role-id { color: #eee; }
    .user-item { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 4px; cursor: pointer; }
    .user-item:hover { background: var(--background-secondary); }
    .user-item img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
    .selected-user-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--background-tertiary); border-radius: 5px; margin-bottom: 8px; }
    .selected-user-item .user-info { display: flex; align-items: center; gap: 10px; overflow: hidden; }
    .selected-user-item img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .selected-user-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .remove-user-btn { background: none; border: none; color: var(--status-fail); cursor: pointer; padding: 5px; display: flex; align-items: center; }
    .modal-footer { padding: 15px 25px; border-top: 1px solid var(--background-tertiary); text-align: right; flex-shrink: 0; }
    .btn-save { background: var(--status-success); color: white; }
    .btn-save:hover:not(:disabled) { background-color: #3aa570; }
    .btn-cancel { background: var(--background-modifier-accent); color: var(--text-normal); margin-left: 10px; }
    .btn-cancel:hover:not(:disabled) { background-color: #5c626b; }

    .modal-content.confirm { max-width: 450px; max-height: none; }
    .confirm-body { padding: 25px; }
    .confirm-body h3 { margin-top: 0; }
    .confirm-footer { text-align: right; padding: 15px 25px; border-top: 1px solid var(--background-tertiary); }
    .btn-danger { background: var(--status-fail); color: white; }
    .btn-danger:hover:not(:disabled) { background-color: #d83c3e; }

    .main-tab-bar { display: flex; border-bottom: 2px solid var(--background-tertiary); margin-bottom: 30px; }
    .main-tab-button { background: none; border: none; color: var(--text-muted); padding: 15px 25px; font-size: 16px; font-weight: 600; cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -2px; }
    .main-tab-button.active { color: var(--header-primary); border-bottom-color: var(--brand-experiment); }
    .main-view { display: none; }

    .settings-container { display: flex; gap: 0; background: var(--background-secondary); border-radius: 8px; border: 1px solid var(--background-tertiary); min-height: 400px; overflow: hidden; }
    .settings-guild-list { width: 200px; background: var(--background-tertiary); padding: 10px; border-right: 1px solid var(--background-tertiary); overflow-y: auto; flex-shrink: 0; }
     .settings-guild-list .guild-item { padding: 8px; margin-bottom: 3px; }
     .settings-guild-list .guild-item img { width: 28px; height: 28px; }
    .settings-content { flex-grow: 1; padding: 20px 25px; overflow-y: auto; display: flex; flex-direction: column; }
     .settings-content h3 { margin-top: 0; margin-bottom: 5px; color: var(--header-primary); padding-bottom: 10px; border-bottom: 1px solid var(--background-tertiary); }
     .settings-content p.description { font-size: 13px; color: var(--text-muted); margin-top: 0; margin-bottom: 20px; line-height: 1.4; }
     .settings-content .search-bar { margin-bottom: 10px; }
    .settings-content .role-list-container { max-height: 250px; flex-grow: 1; margin-bottom: 15px; }
    .settings-content .btn-save { margin-top: auto; align-self: flex-end; }

    .setting-section { background: var(--background-secondary); border-radius: 8px; border: 1px solid var(--background-tertiary); margin-bottom: 20px; overflow: hidden; }
    .setting-section-header { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; cursor: pointer; background: var(--background-tertiary); border-bottom: 1px solid var(--background-tertiary); transition: background-color 0.2s ease; }
     .setting-section-header:hover { background-color: #292b2f; }
     .setting-section-header h3 { margin: 0; padding: 0; border: none; color: var(--header-primary); font-size: 16px; }
    .setting-section-header .toggle-icon { font-size: 24px; color: var(--text-muted); transition: transform 0.3s ease; }
    .setting-section-header.active .toggle-icon { transform: rotate(180deg); }
    .setting-section-content { display: none; padding: 0; }
    .setting-section-content.show { display: block; }
    .setting-section-content .settings-container { border: none; border-radius: 0; min-height: unset; gap: 0; }

    .config-section { padding: 20px; }
    .config-description { font-size: 13px; color: var(--text-muted); margin-top: -5px; margin-bottom: 15px; }
    .role-selector-container { display: flex; gap: 20px; }
    .role-selector { flex: 1; }
    .role-selector label { font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px; }
    .role-search-input { width: 100%; background: var(--background-tertiary); border: 1px solid var(--background-tertiary); border-radius: 4px; padding: 10px; color: var(--text-normal); margin-bottom: 10px; box-sizing: border-box; }
    .role-selector .role-list-container { max-height: 280px; }

    .bot-select-group { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
    .bot-select-label { display: inline-block; cursor: pointer; }
    .bot-select-label input[type="radio"], .bot-select-label input[type="checkbox"] { display: none; }
    .bot-select-label span { display: block; padding: 8px 16px; background-color: var(--background-secondary); border: 1px solid var(--background-tertiary); border-radius: 5px; font-size: 14px; font-weight: 500; color: var(--text-muted); transition: all 0.2s ease; }
    .bot-select-label:hover span { border-color: var(--interactive-hover); color: var(--interactive-hover); }
    .bot-select-label input[type="radio"]:checked + span, .bot-select-label input[type="checkbox"]:checked + span { background-color: var(--brand-experiment); border-color: var(--brand-experiment); color: #fff; font-weight: 600; }
    .modern-input { width: 100%; padding: 10px; background-color: var(--background-primary); border: 1px solid var(--background-tertiary); border-radius: 4px; color: var(--text-normal); font-size: 14px; box-sizing: border-box; }
    .modern-input:disabled { background-color: var(--background-modifier-accent); cursor: not-allowed; }
    .modern-input:focus { border-color: var(--interactive-active); outline: none; }
    .role-item.disabled { cursor: not-allowed; opacity: 0.5; background: var(--background-modifier-accent); pointer-events: none; }
     .role-item.disabled:hover { background: var(--background-modifier-accent); }
     .role-item.disabled .checkbox { border-color: #555; background-color: #555; }
    .spinner { border: 4px solid rgba(255, 255, 255, 0.1); width: 32px; height: 32px; border-radius: 50%; border-left-color: var(--brand-experiment); animation: spin 1s ease infinite; margin: 20px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    #toast { visibility: hidden; min-width: 250px; background-color: #333; color: #fff; text-align: center; border-radius: 5px; padding: 16px; position: fixed; z-index: 1001; left: 50%; transform: translateX(-50%); bottom: 30px; font-size: 17px; }
    #toast.show { visibility: visible; animation: fadein 0.5s, fadeout 0.5s 2.5s; }
    @keyframes fadein { from { bottom: 0; opacity: 0; } to { bottom: 30px; opacity: 1; } }
    @keyframes fadeout { from { bottom: 30px; opacity: 1; } to { bottom: 0; opacity: 0; } }

    @media (max-width: 768px) {
        .sidebar { transform: translateX(-100%); }
        .sidebar.open { transform: translateX(0); }
        .hamburger-menu { display: block; }
        .page-overlay.open { display: block; }
        .main-content { margin-left: 0; padding: 20px; padding-top: 80px; width: calc(100% - 40px); }
        .command-item { flex-direction: column; align-items: flex-start; }
        .command-actions { width: 100%; justify-content: space-between; margin-top: 15px; }
        .modal-body { flex-direction: column; min-height: unset; max-height: calc(90vh - 130px); }
        .guild-list-container { width: 100%; border-right: none; border-bottom: 1px solid var(--background-tertiary); max-height: 150px; flex-shrink: 0; }
        .modal-main-content { overflow-y: auto; } /* Tab content scrolling */
        .tab-content { overflow-y: visible; } /* Allow content to grow */
        .role-list-container { max-height: 200px; }
        .content-split { flex-direction: column; }
        .settings-container { flex-direction: column; min-height: unset; }
        .settings-guild-list { width: 100%; border-right: none; border-bottom: 1px solid var(--background-tertiary); max-height: 150px; }
        .settings-content { padding: 15px; }
         .settings-content .role-list-container { max-height: 200px; }
         .settings-content .btn-save { align-self: stretch; text-align: center; }
         .setting-section-header { padding: 12px 15px; }
         .setting-section-content .settings-content { padding: 15px; }
         .role-selector-container { flex-direction: column; }
    }

</style>
</head>
<body>

<div class="sidebar" id="sidebar">
    <div class="sidebar-header">
        <h2>M E B S U T A</h2>
    </div>
    <nav class="sidebar-nav">
        <a href="index.php" class="active">
            <span class="material-icons-outlined">apps</span>
            Komutlar
        </a>
        <div class="nav-category">
            <div class="nav-category-toggle">
                <span class="material-icons-outlined">receipt_long</span>
                <span>Loglar</span>
                <span class="material-icons-outlined dropdown-icon">expand_more</span>
            </div>
            <div class="submenu">
                <a href="logs/cezalar.php">
                    <span class="material-icons-outlined">gavel</span>
                    Cezalar
                </a>
                <a href="logs/muteler.php">
                    <span class="material-icons-outlined">mic_off</span>
                    Muteler
                </a>
                 <a href="logs/kayit_logs.php">
                    <span class="material-icons-outlined">person_add</span>
                    Kayıtlar
                </a>
                <a href="logs/index.php">
                    <span class="material-icons-outlined">code</span>
                    Komut Logları
                </a>
                 <a href="logs/uyari_log.php">
                    <span class="material-icons-outlined">warning</span>
                    Uyarı Logları
                </a>
                <a href="logs/voice-logs.php">
                    <span class="material-icons-outlined">volume_up</span>
                    Ses Logları
                </a>
                 <a href="logs/voice-keslog.php">
                    <span class="material-icons-outlined">phone_disabled</span>
                    Ses Kesme Logları
                </a>
                 <a href="logs/ceza_af.php">
                    <span class="material-icons-outlined">lock_open</span>
                    Af Logları
                </a>
            </div>
        </div>
        <!-- YENİ: Çıkış Yap Butonu -->
        <a href="#" id="logoutButton">
            <span class="material-icons-outlined">logout</span>
            Çıkış Yap
        </a>
        <!-- YENİ BİTİŞ -->
    </nav>
</div>

<div class="page-overlay" id="overlay"></div>
<div class="hamburger-menu" id="hamburgerMenu">
    <span class="material-icons-outlined">menu</span>
</div>

<div class="main-content">

    <div class="main-tab-bar">
        <button id="mainTabKomutlar" class="main-tab-button active" onclick="showMainTab('komutlar')">Komutlar</button>
        <button id="mainTabAyarlar" class="main-tab-button" onclick="showMainTab('ayarlar')">Genel Ayarlar</button>
    </div>

    <div id="komutlarView" class="main-view" style="display: block;">
        <h1>Komut Yönetim Paneli</h1>
        <div id="commandList">
            <div class="spinner"></div>
        </div>
    </div>

    <div id="ayarlarView" class="main-view">
        <h1>Genel Sunucu Ayarları</h1>

        <div class="setting-section">
            <div class="setting-section-header" onclick="toggleSettingSection(this)">
                <h3>Hoşgeldin Ayarları</h3>
                <span class="material-icons-outlined toggle-icon">expand_more</span>
            </div>
            <div class="setting-section-content">
                <div class="settings-container">
                    <div class="settings-guild-list" id="welcomeGuildList">
                        <p style="padding:10px; color:#72767d;">Sunucular yükleniyor...</p>
                    </div>
                    <div class="settings-content">
                        <p class="description">Yeni üyeler sunucuya katıldığında otomatik hoş geldin mesajının gönderileceği metin kanalını seçin.</p>
                        <div style="margin-bottom: 20px;">
                            <label for="welcomeChannelSearchGeneral" style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Hoşgeldin Kanalı:</label>
                            <div class="search-bar">
                                <input type="text" id="welcomeChannelSearchGeneral" class="search-input" placeholder="Kanal ara (#kanal-adı veya ID)" oninput="filterWelcomeChannelsGeneral()" disabled>
                            </div>
                            <div class="role-list-container" id="welcomeChannelListGeneral">
                                <p style="text-align:center; color:#72767d;">Ayarları görmek için soldan bir sunucu seçin.</p>
                            </div>
                        </div>
                        <button class="btn btn-save" onclick="saveWelcomeSettings()">Hoşgeldin Ayarlarını Kaydet</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="setting-section">
            <div class="setting-section-header" onclick="toggleSettingSection(this)">
                <h3>Oto Rol Ayarları</h3>
                <span class="material-icons-outlined toggle-icon">expand_more</span>
            </div>
            <div class="setting-section-content">
                <div class="settings-container">
                    <div class="settings-guild-list" id="autoroleGuildList">
                         <p style="padding:10px; color:#72767d;">Sunucular yükleniyor...</p>
                    </div>
                    <div class="settings-content">
                        <p class="description">Yeni üyeler sunucuya katıldığında otomatik olarak verilecek rolü seçin.</p>

                        <div style="margin-bottom: 20px;">
                            <label style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Oto Rol Botu:</label>
                            <p class="description" style="font-size: 13px; color: var(--text-muted); margin-top: 0; margin-bottom: 8px;">Bu özelliği hangi botun yöneteceğini seçin.</p>
                            <div class="bot-select-group">
                                <label class="bot-select-label">
                                    <input type="radio" id="autoroleBot1" name="autorole-bot-select" value="bot1">
                                    <span>Bot 1 (Ana)</span>
                                </label>
                                <label class="bot-select-label">
                                    <input type="radio" id="autoroleBot2" name="autorole-bot-select" value="bot2">
                                    <span>Bot 2 (Token 2)</span>
                                </label>
                            </div>
                        </div>

                        <div style="margin-bottom: 20px;">
                             <label for="autoroleRoleSearchGeneral" style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Otomatik Rol:</label>
                            <div class="search-bar">
                                <input type="text" id="autoroleRoleSearchGeneral" class="search-input" placeholder="Rol ara (rol adı veya ID)" oninput="filterAutoroleRolesGeneral()" disabled>
                            </div>
                            <div class="role-list-container" id="autoroleRoleListGeneral">
                                <p style="text-align:center; color:#72767d;">Ayarları görmek için soldan bir sunucu seçin.</p>
                            </div>
                        </div>
                        <button class="btn btn-save" onclick="saveAutoroleSettings()">Oto Rol Ayarlarını Kaydet</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="setting-section">
            <div class="setting-section-header" onclick="toggleSettingSection(this)">
                <h3>Tag Ayarları</h3>
                <span class="material-icons-outlined toggle-icon">expand_more</span>
            </div>
            <div class="setting-section-content">
                <div class="settings-container">
                    <div class="settings-guild-list" id="tagGuildList">
                         <p style="padding:10px; color:#72767d;">Sunucular yükleniyor...</p>
                    </div>
                    <div class="settings-content">
                        <p class="description">Kullanıcının ismine eklediği tag'e göre rol verecek ayarları yapın. Tag, kullanıcının görünen adının <strong>başında</strong> olmalıdır.</p>

                        <div style="margin-bottom: 20px;">
                            <label style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Tag Botu:</label>
                            <p class="description" style="font-size: 13px; color: var(--text-muted); margin-top: 0; margin-bottom: 8px;">Bu özelliği hangi botun yöneteceğini seçin.</p>
                            <div class="bot-select-group">
                                <label class="bot-select-label">
                                    <input type="radio" id="tagBot1" name="tag-bot-select" value="bot1">
                                    <span>Bot 1 (Ana)</span>
                                </label>
                                <label class="bot-select-label">
                                    <input type="radio" id="tagBot2" name="tag-bot-select" value="bot2">
                                    <span>Bot 2 (Token 2)</span>
                                </label>
                            </div>
                        </div>

                        <div style="margin-bottom: 20px;">
                             <label for="tagTextInputGeneral" style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Tag Yazısı:</label>
                             <p class="description" style="font-size: 13px; color: var(--text-muted); margin-top: 0; margin-bottom: 8px;">Kullanıcının isminin başına eklemesi gereken tag. (Örn: $, ⚚)</p>
                             <input type="text" id="tagTextInputGeneral" class="modern-input" placeholder="Tag girin..." disabled>
                        </div>

                        <div style="margin-bottom: 20px;">
                             <label for="tagRoleSearchGeneral" style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Tag Rolü:</label>
                             <p class="description" style="font-size: 13px; color: var(--text-muted); margin-top: 0; margin-bottom: 8px;">Tagı alan kullanıcıya verilecek rol.</p>
                            <div class="search-bar">
                                <input type="text" id="tagRoleSearchGeneral" class="search-input" placeholder="Rol ara (rol adı veya ID)" oninput="filterTagRolesGeneral()" disabled>
                            </div>
                            <div class="role-list-container" id="tagRoleListGeneral">
                                <p style="text-align:center; color:#72767d;">Ayarları görmek için soldan bir sunucu seçin.</p>
                            </div>
                        </div>
                        <button class="btn btn-save" onclick="saveTagSettings()">Tag Ayarlarını Kaydet</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="setting-section">
            <div class="setting-section-header" onclick="toggleSettingSection(this)">
                <h3>Jail Ayarları (.jail / .tjail)</h3>
                <span class="material-icons-outlined toggle-icon">expand_more</span>
            </div>
            <div class="setting-section-content">
                <div class="settings-container">
                    <div class="settings-guild-list" id="jailGuildList">
                        <p style="padding:10px; color:#72767d;">Sunucular yükleniyor...</p>
                    </div>
                    <div class="settings-content">
                        <p class="description">`.jail` ve `.tjail` komutları için kullanılacak rolü ve logların gönderileceği kanalı seçin.</p>
                        <div style="margin-bottom: 20px;">
                            <label for="jailRoleSearchGeneral" style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Jail Rolü:</label>
                            <div class="search-bar">
                                <input type="text" id="jailRoleSearchGeneral" class="search-input" placeholder="Jail rolü ara (rol adı veya ID)" oninput="filterJailRolesGeneral()" disabled>
                            </div>
                            <div class="role-list-container" id="jailRoleListGeneral">
                                <p style="text-align:center; color:#72767d;">Ayarları görmek için soldan bir sunucu seçin.</p>
                            </div>
                        </div>
                        <div>
                             <label for="jailLogChannelSearch" style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Jail Log Kanalı:</label>
                            <div class="search-bar">
                                <input type="text" id="jailLogChannelSearch" class="search-input" placeholder="Log kanalı ara (#kanal-adı veya ID)" oninput="filterJailLogChannels()" disabled>
                            </div>
                            <div class="role-list-container" id="jailLogChannelList">
                                <p style="text-align:center; color:#72767d;">Ayarları görmek için soldan bir sunucu seçin.</p>
                            </div>
                        </div>
                        <button class="btn btn-save" onclick="saveJailSettings()">Jail Ayarlarını Kaydet</button>
                    </div>
                </div>
            </div>
        </div>

		<div class="setting-section">
            <div class="setting-section-header" onclick="toggleSettingSection(this)">
                <h3>Yetki Olarak Tanınan Rol Ayarları</h3>
                <span class="material-icons-outlined toggle-icon">expand_more</span>
            </div>
            <div class="setting-section-content">
                <div class="settings-container">
                    <div class="settings-guild-list" id="yetkiGuildList">
                        <p style="padding:10px; color:#72767d;">Sunucular yükleniyor...</p>
                    </div>
                    <div class="settings-content">
                        <p class="description">`.yt` komutunda "yetki" olarak kabul edilecek rolleri seçin. Kullanıcılar, Discord hiyerarşisinde kendi rollerinin altında olan rolleri başkalarına verebilir.</p>
                        <div style="margin-bottom: 20px;">
                            <label for="yetkiRoleSearch" style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Yetki Rolleri:</label>
                            <div class="search-bar">
                                <input type="text" id="yetkiRoleSearch" class="search-input" placeholder="Rol ara (rol adı veya ID)" oninput="filterYetkiRoles()" disabled>
                            </div>
                            <div class="role-list-container" id="yetkiRoleList">
                                <p style="text-align:center; color:#72767d;">Ayarları görmek için soldan bir sunucu seçin.</p>
                            </div>
                        </div>
                        <button class="btn btn-save" onclick="saveYetkiSettings()">Yetki Rollerini Kaydet</button>
                    </div>
                </div>
            </div>
        </div>
		
        <div class="setting-section">
            <div class="setting-section-header" onclick="toggleSettingSection(this)">
                <h3>Yetkili Rol Ayarları (.ysay)</h3>
                <span class="material-icons-outlined toggle-icon">expand_more</span>
            </div>
            <div class="setting-section-content">
                <div class="settings-container">
                    <div class="settings-guild-list" id="ysayGuildList">
                        <p style="padding:10px; color:#72767d;">Sunucular yükleniyor...</p>
                    </div>
                    <div class="settings-content">
                        <p class="description">`.ysay` komutunun sayım yapacağı ve listeleyeceği yetkili rollerini kategorize edin. Bir rolü birden fazla kategoriye ekleyemezsiniz.</p>

                        <div class="role-selector-container" style="flex-direction: column; gap: 20px;">

                            <div class="role-selector">
                                <label for="ysayYonetimRoleSearch">Yönetim Rolleri (Genel):</label>
                                <input type="text" id="ysayYonetimRoleSearch" class="role-search-input" placeholder="Rol ara..." onkeyup="filterYsayRoles('yonetim')" disabled>
                                <div class="role-list-container" id="ysayYonetimRoleList" style="max-height: 200px;">
                                    <p style="text-align:center; color:#72767d;">Ayarları görmek için soldan bir sunucu seçin.</p>
                                </div>
                            </div>

                            <div class="role-selector">
                                <label for="ysayAltYonetimRoleSearch">Alt Yönetim Rolleri:</label>
                                <input type="text" id="ysayAltYonetimRoleSearch" class="role-search-input" placeholder="Rol ara..." onkeyup="filterYsayRoles('alt_yonetim')" disabled>
                                <div class="role-list-container" id="ysayAltYonetimRoleList" style="max-height: 200px;">
                                    <p style="text-align:center; color:#72767d;">Ayarları görmek için soldan bir sunucu seçin.</p>
                                </div>
                            </div>

                            <div class="role-selector">
                                <label for="ysayOrtaYonetimRoleSearch">Orta Yönetim Rolleri:</label>
                                <input type="text" id="ysayOrtaYonetimRoleSearch" class="role-search-input" placeholder="Rol ara..." onkeyup="filterYsayRoles('orta_yonetim')" disabled>
                                <div class="role-list-container" id="ysayOrtaYonetimRoleList" style="max-height: 200px;">
                                    <p style="text-align:center; color:#72767d;">Ayarları görmek için soldan bir sunucu seçin.</p>
                                </div>
                            </div>

                            <div class="role-selector">
                                <label for="ysayUstYonetimRoleSearch">Üst Yönetim Rolleri:</label>
                                <input type="text" id="ysayUstYonetimRoleSearch" class="role-search-input" placeholder="Rol ara..." onkeyup="filterYsayRoles('ust_yonetim')" disabled>
                                <div class="role-list-container" id="ysayUstYonetimRoleList" style="max-height: 200px;">
                                    <p style="text-align:center; color:#72767d;">Ayarları görmek için soldan bir sunucu seçin.</p>
                                </div>
                            </div>

                        </div>

                        <button class="btn btn-save" onclick="saveYsaySettings()" style="margin-top: 20px;">Yetkili Rol Ayarlarını Kaydet</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="setting-section">
            <div class="setting-section-header" onclick="toggleSettingSection(this)">
                <h3>Stat Ayarları (.stat)</h3>
                <span class="material-icons-outlined toggle-icon">expand_more</span>
            </div>
            <div class="setting-section-content">
                <div class="settings-container">
                    <div class="settings-guild-list" id="statCategoryGuildList">
                        <p style="padding:10px; color:#72767d;">Sunucular yükleniyor...</p>
                    </div>
                    <div class="settings-content">
                        <p class="description">`.stat` komutunda ses kanallarının hangi kategori altında toplanacağını belirleyin. Bir kanal birden fazla kategoride olamaz.</p>

                        <div class="content-split" style="margin-bottom: 20px; gap: 15px;">
                            <div style="flex: 1;">
                                <label style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Kategoriler:</label>
                                <div class="role-list-container" id="statCategoryList" style="max-height: 250px;">
                                    <p style="text-align:center; color:#72767d;">Ayarları görmek için soldan bir sunucu seçin.</p>
                                </div>
                                <button id="addStatCategoryBtn" class="btn btn-settings" onclick="promptAddStatCategory()" style="margin-top: 10px; width: 100%;" disabled>Yeni Kategori Ekle</button>
                            </div>
                            <div style="flex: 2;">
                                 <label style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Kategoriye Ait Ses Kanalları:</label>
                                 <div class="search-bar" style="margin-bottom: 10px;">
                                    <input type="text" id="statCategoryChannelSearch" class="search-input" placeholder="Ses kanalı ara..." oninput="filterStatCategoryChannels()" disabled>
                                 </div>
                                 <div class="role-list-container" id="statCategoryChannelList" style="max-height: 250px;">
                                    <p style="text-align:center; color:#72767d;">Kanalları görmek için soldan bir kategori seçin.</p>
                                 </div>
                            </div>
                        </div>

                        <button class="btn btn-save" onclick="saveStatCategorySettings()" style="margin-top: auto;">Kategori Ayarlarını Kaydet</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="setting-section">
            <div class="setting-section-header" onclick="toggleSettingSection(this)">
                <h3>Otomatik Ses Kanalı Girişi</h3>
                <span class="material-icons-outlined toggle-icon">expand_more</span>
            </div>
            <div class="setting-section-content">
                <div class="settings-container">
                    <div class="settings-guild-list" id="autoJoinGuildList">
                        <p style="padding:10px; color:#72767d;">Sunucular yükleniyor...</p>
                    </div>
                    <div class="settings-content">
                        <p class="description">Bot(lar) başladığında hangi sunucuda hangi ses kanalına otomatik olarak katılacağını seçin.</p>

                        <div style="margin-bottom: 20px;">
                            <label style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Giriş Yapacak Bot(lar):</label>
                            <p class="description" style="font-size: 13px; color: var(--text-muted); margin-top: 0; margin-bottom: 8px;">Bu sunucudaki kanala hangi bot(lar)ın katılacağını seçin.</p>

                            <div class="bot-select-group">
                                <label class="bot-select-label">
                                    <input type="checkbox" id="autoJoinBot1" name="autojoin-bot-select" value="bot1" disabled>
                                    <span>Bot 1 (Ana)</span>
                                </label>
                                <label class="bot-select-label">
                                    <input type="checkbox" id="autoJoinBot2" name="autojoin-bot-select" value="bot2" disabled>
                                    <span>Bot 2 (Token 2)</span>
                                </label>
                            </div>
                            </div>

                        <div style="margin-bottom: 20px;">
                             <label for="autoJoinChannelSearch" style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Katılınacak Ses Kanalı:</label>
                            <div class="search-bar">
                                <input type="text" id="autoJoinChannelSearch" class="search-input" placeholder="Ses kanalı ara (kanal adı veya ID)" oninput="filterAutoJoinChannels()" disabled>
                            </div>
                            <div class="role-list-container" id="autoJoinChannelList">
                                <p style="text-align:center; color:#72767d;">Ayarları görmek için soldan bir sunucu seçin.</p>
                            </div>
                        </div>
                        <button class="btn btn-save" onclick="saveAutoJoinSettings()">Otomatik Giriş Ayarlarını Kaydet</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="setting-section">
            <div class="setting-section-header" onclick="toggleSettingSection(this)">
                <h3>Ses Log Ayarları (Giriş - Çıkış)</h3>
                <span class="material-icons-outlined toggle-icon">expand_more</span>
            </div>
            <div class="setting-section-content">
                <div class="settings-container">
                    <div class="settings-guild-list" id="vlogGuildList">
                        <p style="padding:10px; color:#72767d;">Sunucular yükleniyor...</p>
                    </div>
                    <div class="settings-content">
                        <p class="description">Kullanıcılar ses kanallarına katıldığında veya ayrıldığında, durumlarını ve kanaldaki diğer üyeleri Discord üzerinde seçtiğiniz metin kanalına gönderir.</p>
                        <div class="search-bar">
                            <input type="text" id="vlogChannelSearch" class="search-input" placeholder="Log kanalı ara (#kanal-adı veya ID)" oninput="filterVlogChannels()" disabled>
                        </div>
                        <div class="role-list-container" id="vlogChannelList">
                            <p style="text-align:center; color:#72767d;">Ayarları görmek için soldan bir sunucu seçin.</p>
                        </div>
                        <button class="btn btn-save" onclick="saveVlogSettings()">Ayarları Kaydet</button>
                    </div>
                </div>
            </div>
        </div>

    </div>

</div>

<div id="settingsModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2 id="modalCommandName">Komut Ayarları</h2>
            <span class="close-btn" onclick="closeSettingsModal()">&times;</span>
        </div>
        <div class="modal-body">
            <div class="guild-list-container" id="guildList">
            </div>
            <div class="modal-main-content">
                <div class="tab-bar">
                    <button id="tabBtnRoles" class="tab-button" onclick="showTab('roles')">İzinler & Bot Seçimi</button>
                    <button id="tabBtnUsers" class="tab-button" onclick="showTab('users')">İzinli Kullanıcılar</button>
                    <button id="tabBtnConfig" class="tab-button" onclick="showTab('config')" style="display: none;">Config</button>
                    <button id="tabBtnLog" class="tab-button" onclick="showTab('log')" style="display: none;">Log Kanalı</button>
                </div>

                <div id="tabContentRoles" class="tab-content">
                    <div class="guild-header">
                        <span id="selectedGuildName">Sunucu Seçin</span>
                    </div>
                    <div class="content-body">

                        <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--background-tertiary);">
                            <label style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Yürütücü Bot:</label>
                            <p class="description" style="font-size: 13px; color: var(--text-muted); margin-top: 0; margin-bottom: 8px;">Bu komutu bu sunucuda hangi botun yürüteceğini seçin.</p>
                            <div class="bot-select-group" style="margin-bottom: 0;">
                                <label class="bot-select-label">
                                    <input type="radio" id="commandBot1" name="command-bot-select" value="bot1" disabled>
                                    <span>Bot 1 (Ana)</span>
                                </label>
                                <label class="bot-select-label">
                                    <input type="radio" id="commandBot2" name="command-bot-select" value="bot2" disabled>
                                    <span>Bot 2 (Token 2)</span>
                                </label>
                            </div>
                        </div>

                        <label style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">İzinli Roller:</label>
                        <div class="search-bar" style="margin-top: 0;">
                            <input type="text" id="roleSearch" class="search-input" placeholder="Rol ara (rol adı veya ID)" oninput="filterRoles()" disabled>
                        </div>
                        <div class="role-list-container" id="roleList">
                            <p style="text-align:center; color:#72767d;">Rolleri görmek için yukarıdan bir sunucu seçin.</p>
                        </div>
                    </div>
                </div>

                <div id="tabContentUsers" class="tab-content">
                    <div class="guild-header">
                        <span id="selectedGuildNameUsers">Sunucu Seçin (Aynı)</span>
                    </div>
                    <div class="content-body content-split">
                        <div class="search-half">
                            <h4>Kullanıcı Ara</h4>
                            <div class="search-bar" style="display:flex; gap: 5px;">
                                <input type="text" id="userSearch" class="search-input" placeholder="Kullanıcı ID'si girin" disabled>
                                <button id="userSearchBtn" class="btn btn-settings" onclick="searchUsers(true)" disabled>Ara</button>
                            </div>
                            <div class="role-list-container" id="userSearchResults">
                                <p style="text-align:center; color:#72767d;">Kullanıcı aramak için yukarıdan bir sunucu seçin.</p>
                            </div>
                        </div>
                        <div class="list-half">
                            <h4>İzinli Kullanıcılar</h4>
                            <div class="role-list-container" id="selectedUserList">
                                 <p style="text-align:center; color:#72767d;">İzinli kullanıcıları görmek için bir sunucu seçin.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="tabContentConfig" class="tab-content">
                    <div class="guild-header">
                        <span id="selectedGuildNameConfig">Sunucu Seçin</span>
                    </div>

                    <div class="config-section" id="e-config-section" style="display: none;">
                        <h4>Kayıt (.e / .k) Rol Ayarları</h4>
                        <p class="config-description">
                            Kayıt işlemi tamamlandığında verilecek rolleri seçin.
                        </p>
                        <div class="role-selector-container">
                            <div class="role-selector">
                                <label for="erkekRoleSearch">Erkek Rolü:</label>
                                <input type="text" id="erkekRoleSearch" class="role-search-input" placeholder="Rol ara..." onkeyup="filterErkekRoles()">
                                <div class="role-list-container" id="erkekRoleList"></div>
                            </div>
                            <div class="role-selector">
                                <label for="kadinRoleSearch">Kadın Rolü:</label>
                                <input type="text" id="kadinRoleSearch" class="role-search-input" placeholder="Rol ara..." onkeyup="filterKadinRoles()">
                                <div class="role-list-container" id="kadinRoleList"></div>
                            </div>
                        </div>
                    </div>

                    <div class="config-section" id="sleep-config-section" style="display: none;">
                        <h4>AFK (.sleep) Kanal Ayarı</h4>
                        <p class="config-description">
                            `.sleep` komutu kullanıldığında hedefin gönderileceği **ses kanalını** seçin.
                        </p>
                         <label for="sleepAfkChannelSearch" style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">AFK Ses Kanalı:</label>
                        <input type="text" id="sleepAfkChannelSearch" class="role-search-input" placeholder="Ses kanalı ara..." onkeyup="filterSleepAfkChannels()" disabled>
                        <div class="role-list-container" id="sleepAfkChannelList">
                             <p style="text-align:center; color:#72767d;">Kanalı seçmek için yukarıdan bir sunucu seçin.</p>
                        </div>
                    </div>

                    <div class="config-section" id="bestof-config-section" style="display: none;">
                        <h4>Best Of (.bestof) Rol Ayarı</h4>
                        <p class="config-description">
                            `.bestof` komutu kullanıldığında verilecek rolü seçin.
                        </p>
                        <label for="bestofRoleSearch" style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">"Best Of" Rolü:</label>
                        <input type="text" id="bestofRoleSearch" class="role-search-input" placeholder="Rol ara..." onkeyup="filterBestofRoles()" disabled>
                        <div class="role-list-container" id="bestofRoleList">
                             <p style="text-align:center; color:#72767d;">Rolü seçmek için yukarıdan bir sunucu seçin.</p>
                        </div>
                    </div>

                     <div class="config-section" id="uyari1-config-section" style="display: none;">
                        <h4>Uyarı 1 (.uyari1) Rol Ayarı</h4>
                        <p class="config-description">
                            `.uyari1` komutu kullanıldığında verilecek rolü seçin. Bu rol `.uyari2` rolü ile aynı olamaz.
                        </p>
                        <label for="uyari1RoleSearch" style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Uyarı 1 Rolü:</label>
                        <input type="text" id="uyari1RoleSearch" class="role-search-input" placeholder="Rol ara..." onkeyup="filterUyari1Roles()" disabled>
                        <div class="role-list-container" id="uyari1RoleList">
                             <p style="text-align:center; color:#72767d;">Rolü seçmek için yukarıdan bir sunucu seçin.</p>
                        </div>
                    </div>

                     <div class="config-section" id="uyari2-config-section" style="display: none;">
                        <h4>Uyarı 2 (.uyari2) Rol Ayarı</h4>
                        <p class="config-description">
                             `.uyari2` komutu kullanıldığında verilecek rolü seçin. Bu rol `.uyari1` rolü ile aynı olamaz.
                        </p>
                        <label for="uyari2RoleSearch" style="font-weight: 600; font-size: 14px; color: var(--header-secondary); display: block; margin-bottom: 8px;">Uyarı 2 Rolü:</label>
                        <input type="text" id="uyari2RoleSearch" class="role-search-input" placeholder="Rol ara..." onkeyup="filterUyari2Roles()" disabled>
                        <div class="role-list-container" id="uyari2RoleList">
                             <p style="text-align:center; color:#72767d;">Rolü seçmek için yukarıdan bir sunucu seçin.</p>
                        </div>
                    </div>

                    </div>

                <div id="tabContentLog" class="tab-content">
                    <div class="guild-header">
                        <span id="selectedGuildNameLog">Sunucu Seçin</span>
                    </div>
                    <div class="content-body">
                         <p class="config-description" style="font-size: 13px; color: var(--text-muted); margin-top: 0; margin-bottom: 15px;">
                            Bu komut kullanıldığında (başarılı veya başarısız) log atılacak kanalı seçin.
                        </p>
                        <div class="search-bar">
                            <input type="text" id="logChannelSearch" class="search-input" placeholder="Kanal ara (#kanal-adı veya ID)" oninput="filterLogChannels()" disabled>
                        </div>
                        <div class="role-list-container" id="logChannelList">
                            <p style="text-align:center; color:#72767d;">Log kanalını seçmek için yukarıdan bir sunucu seçin.</p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-cancel" onclick="closeSettingsModal()">İptal</button>
            <button class="btn btn-save" onclick="saveCommandPermissions()">Kaydet</button>
        </div>
    </div>
</div>

<div id="confirmationModal" class="modal">
    <div class="modal-content confirm">
        <div class="confirm-body">
            <h3 id="confirmationTitle">Emin misiniz?</h3>
            <p id="confirmationMessage">Bu işlem geri alınamaz.</p>
        </div>
        <div class="confirm-footer">
            <button id="cancelBtn" class="btn btn-cancel">İptal</button>
            <button id="confirmBtn" class="btn btn-danger">Onayla</button>
        </div>
    </div>
</div>

<div id="toast"></div>

<script src="web_js/sidebar.js"></script>
<script src="web_js/bloxian.js"></script>
<!-- YENİ: Çıkış Yap Scripti -->
<script>
    document.addEventListener('DOMContentLoaded', () => {
        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                // Oturum bilgisini temizle
                sessionStorage.removeItem('isLoggedIn');
                // Login sayfasına yönlendir
                window.location.href = 'login.html';
            });
        }
    });
</script>
<!-- YENİ BİTİŞ -->
</body>
</html>
