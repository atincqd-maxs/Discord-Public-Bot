let currentCezaTipi = 'jail';

document.addEventListener('DOMContentLoaded', () => {
    const sortFilter = document.getElementById('sortFilter');
    const userFilter = document.getElementById('userFilter');
    const muteTypeFilter = document.getElementById('muteTypeFilter');

    if (sortFilter) {
        sortFilter.addEventListener('change', () => loadLogs(getCurrentCezaTipi(), 1));
    }
    if (userFilter) {
        userFilter.addEventListener('change', () => loadLogs(getCurrentCezaTipi(), 1));
    }
    if (muteTypeFilter) {
         muteTypeFilter.addEventListener('change', () => loadLogs(getCurrentCezaTipi(), 1));
    }
});

function getCurrentCezaTipi() {
    const muteTypeFilter = document.getElementById('muteTypeFilter');
    return muteTypeFilter ? muteTypeFilter.value : 'jail';
}


function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = message;
    toast.className = 'show';
    setTimeout(() => { toast.className = '' }, 3000);
}

function copyToClipboard(text, element) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = element.textContent;
        element.textContent = 'Kopyalandı!';
        element.classList.add('copied');
        setTimeout(() => {
            element.textContent = originalText;
            element.classList.remove('copied');
        }, 1500);
    }).catch(err => {
        console.error('ID kopyalanamadı:', err);
        showToast('ID kopyalanamadı.');
    });
}

async function loadUserFilterData() {
    const userFilter = document.getElementById('userFilter');
    if (!userFilter) return;

    try {
        const res = await fetch(`../api.php?action=get_jail_moderators`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        userFilter.innerHTML = '<option value="all">Tüm Yetkililer</option>';

        data.users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.moderator_id;
            option.textContent = `${user.moderator_tag || 'Bilinmiyor'} (${user.moderator_id})`;
            userFilter.appendChild(option);
        });

    } catch (e) {
        console.error('Yetkili filtresi yüklenemedi:', e);
        showToast('Yetkili filtresi verileri yüklenemedi.');
    }
}


function formatTimestamp(isoString) {
    try {
        const dateStr = isoString.replace(' ', 'T') + 'Z';
        const date = new Date(dateStr);
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        if (isNaN(date.getTime())) {
            return isoString;
        }

        const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        return date.toLocaleString('tr-TR', options);
    } catch (e) {
        return isoString;
    }
}

function formatDuration(start, end) {
    try {
        const startDateStr = start.replace(' ', 'T') + 'Z';
        const endDateStr = end ? end.replace(' ', 'T') + 'Z' : null;

        const startDate = new Date(startDateStr);
        startDate.setMinutes(startDate.getMinutes() - startDate.getTimezoneOffset());

        if (isNaN(startDate.getTime()) || !endDateStr) return '?';

        const endDate = new Date(endDateStr);
        endDate.setMinutes(endDate.getMinutes() - endDate.getTimezoneOffset());

        if (isNaN(endDate.getTime())) return '?';

        let diff = Math.abs(endDate.getTime() - startDate.getTime()) / 1000;

        const d = Math.floor(diff / (24 * 60 * 60));
        diff -= d * 24 * 60 * 60;
        const h = Math.floor(diff / (60 * 60));
        diff -= h * 60 * 60;
        const m = Math.floor(diff / 60);

        let result = '';
        if (d > 0) result += `${d} gün `;
        if (h > 0) result += `${h} saat `;
        if (m > 0) result += `${m} dk `;

        return result.trim() || '< 1 dk';
     } catch(e) {
        console.error("Süre formatlama hatası:", e);
        return '?';
     }
}

function getCezaTipiText(tipi) {
    switch (tipi) {
        case 'jail': return '<span class="ceza-tipi-tag ceza-jail">JAIL</span>';
        case 'voicemute': return '<span class="ceza-tipi-tag ceza-vmute">SES MUTE</span>';
        case 'chatmute': return '<span class="ceza-tipi-tag ceza-cmute">CHAT MUTE</span>';
        default: return `<span class="ceza-tipi-tag ceza-other">${(tipi || '').toUpperCase()}</span>`;
    }
}

async function loadLogs(cezaTipi, page = 1) {
    const logList = document.getElementById('logList');
    const paginationContainer = document.getElementById('pagination');

    logList.innerHTML = '<div class="spinner"></div>';
    paginationContainer.innerHTML = '';

    const sort = document.getElementById('sortFilter').value;
    const userFilterElement = document.getElementById('userFilter');
    const moderator_id = userFilterElement ? userFilterElement.value : 'all';
    const muteTypeElement = document.getElementById('muteTypeFilter');
    const effectiveCezaTipi = muteTypeElement ? muteTypeElement.value : cezaTipi;


    try {
        const apiUrl = `../api.php?action=get_ceza_logs&page=${page}&sort=${sort}&tipi=${effectiveCezaTipi}&moderator_id=${moderator_id}`;
        const res = await fetch(apiUrl);
        const data = await res.json();

        if (data.error) {
            throw new Error(data.error);
        }

        logList.innerHTML = '';

        if (data.logs.length === 0) {
            logList.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Bu filtrelerle eşleşen ceza bulunamadı.</p>';
        } else {
            data.logs.forEach(log => {
                const card = document.createElement('div');
                card.className = 'ceza-log-card';

                const statusClass = log.aktif ? 'status-aktif' : 'status-bitti';
                const statusText = log.aktif ? 'Aktif' : 'Bitti';

                const userAvatar = log.user_avatar || `https://cdn.discordapp.com/embed/avatars/${log.user_id % 5}.png`;
                const modAvatar = log.moderator_avatar || `https://cdn.discordapp.com/embed/avatars/${log.moderator_id % 5}.png`;

                const userTagDisplay = log.user_tag || 'Bilinmiyor';
                const modTagDisplay = log.moderator_tag || 'Bilinmiyor';

                card.innerHTML = `
                    <div class="ceza-header">
                        ${getCezaTipiText(log.ceza_tipi)}
                        <span class="ceza-id">#${log.id}</span>
                        <span class="ceza-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="ceza-users">
                        <div class="user-info">
                            <img src="${modAvatar}" class="user-avatar" alt="Mod Avatar">
                            <div class="user-details">
                                <span class="user-tag">${modTagDisplay}</span>
                                <span class="user-id" title="ID Kopyala" onclick="copyToClipboard('${log.moderator_id}', this)">${log.moderator_id}</span>
                            </div>
                            <span class="user-role-label">Yetkili</span>
                        </div>
                        <span class="arrow-icon material-icons-outlined">arrow_forward</span>
                        <div class="user-info">
                            <img src="${userAvatar}" class="user-avatar" alt="User Avatar">
                            <div class="user-details">
                                <span class="user-tag">${userTagDisplay}</span>
                                <span class="user-id" title="ID Kopyala" onclick="copyToClipboard('${log.user_id}', this)">${log.user_id}</span>
                            </div>
                             <span class="user-role-label">Kullanıcı</span>
                        </div>
                    </div>
                    <div class="ceza-details">
                        <div class="detail-item">
                            <span class="detail-label">Sebep:</span>
                            <span class="detail-value reason">${log.sebep || 'Belirtilmemiş'}</span>
                        </div>
                        ${log.channel_id && log.ceza_tipi === 'chatmute' ? `
                        <div class="detail-item">
                            <span class="detail-label">Kanal:</span>
                            <span class="detail-value channel"><#${log.channel_id}></span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="ceza-timing">
                        <div class="time-item">
                            <span class="time-label">Başlangıç:</span>
                            <span class="time-value">${formatTimestamp(log.baslangic_tarihi)}</span>
                        </div>
                         ${log.bitis_tarihi ? `
                        <div class="time-item">
                            <span class="time-label">Bitiş:</span>
                            <span class="time-value">${formatTimestamp(log.bitis_tarihi)}</span>
                        </div>
                        <div class="time-item">
                            <span class="time-label">Süre:</span>
                            <span class="time-value">${formatDuration(log.baslangic_tarihi, log.bitis_tarihi)}</span>
                        </div>
                        ` : `
                        <div class="time-item">
                             <span class="time-label">Süre:</span>
                            <span class="time-value">Kalıcı</span>
                        </div>
                        `}
                    </div>
                `;
                logList.appendChild(card);
            });
        }

        renderPagination(data.pagination);

    } catch (e) {
        logList.innerHTML = `<p style="text-align:center; color:#f04747;">Loglar yüklenirken bir hata oluştu: ${e.message}</p>`;
        console.error(e);
        showToast('Loglar yüklenirken bir hata oluştu.');
    }
}

function renderPagination(pagination) {
    const { total_pages, current_page } = pagination;
    const paginationContainer = document.getElementById('pagination');
    paginationContainer.innerHTML = '';

    if (total_pages <= 1) {
        return;
    }

    const prevButton = document.createElement('button');
    prevButton.innerHTML = '&laquo; Geri';
    prevButton.disabled = (current_page === 1);
    prevButton.onclick = () => loadLogs(getCurrentCezaTipi(), current_page - 1);
    paginationContainer.appendChild(prevButton);

    const pageInfo = document.createElement('span');
    pageInfo.className = 'page-info';
    pageInfo.textContent = `Sayfa ${current_page} / ${total_pages}`;
    paginationContainer.appendChild(pageInfo);

    const nextButton = document.createElement('button');
    nextButton.innerHTML = 'İleri &raquo;';
    nextButton.disabled = (current_page === total_pages);
    nextButton.onclick = () => loadLogs(getCurrentCezaTipi(), current_page + 1);
    paginationContainer.appendChild(nextButton);
}