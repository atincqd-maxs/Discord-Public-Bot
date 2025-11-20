document.addEventListener('DOMContentLoaded', () => {
    const sortFilter = document.getElementById('sortFilter');
    const userFilter = document.getElementById('userFilter');
    const uyariTypeFilter = document.getElementById('uyariTypeFilter');

    if (sortFilter) sortFilter.addEventListener('change', () => loadLogs(1));
    if (userFilter) userFilter.addEventListener('change', () => loadLogs(1));
    if (uyariTypeFilter) uyariTypeFilter.addEventListener('change', () => loadLogs(1));

    loadUserFilterData();
    loadLogs(1);
});


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
        const res = await fetch(`../api.php?action=get_uyari_moderators`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        userFilter.innerHTML = '<option value="all">Tüm Yetkililer</option>';

        // data.users'ın bir dizi olduğundan emin ol
        if (data && Array.isArray(data.users)) {
            data.users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.moderator_id;
                option.textContent = `${user.moderator_tag || 'Bilinmiyor'} (${user.moderator_id})`;
                userFilter.appendChild(option);
            });
        } else {
             console.error('API yanıtında "users" dizisi bulunamadı veya formatı yanlış.');
             showToast('Yetkili filtresi verileri yüklenemedi (API yanıt hatası).');
        }


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


function getCezaTipiText(tipi) {
    switch (tipi) {
        case 'uyari1': return '<span class="ceza-tipi-tag ceza-uyari1">UYARI 1</span>';
        case 'uyari2': return '<span class="ceza-tipi-tag ceza-uyari2">UYARI 2</span>';
        default: return `<span class="ceza-tipi-tag ceza-other">${(tipi || '').toUpperCase()}</span>`;
    }
}

async function loadLogs(page = 1) {
    const logList = document.getElementById('logList');
    const paginationContainer = document.getElementById('pagination');

    logList.innerHTML = '<div class="spinner"></div>';
    paginationContainer.innerHTML = '';

    const sort = document.getElementById('sortFilter').value;
    const userFilterElement = document.getElementById('userFilter');
    const moderator_id = userFilterElement ? userFilterElement.value : 'all';
    const uyariTypeElement = document.getElementById('uyariTypeFilter');
    const effectiveCezaTipi = uyariTypeElement ? uyariTypeElement.value : 'uyari1,uyari2';


    try {
        const apiUrl = `../api.php?action=get_uyari_logs&page=${page}&sort=${sort}&tipi=${effectiveCezaTipi}&moderator_id=${moderator_id}`;
        const res = await fetch(apiUrl);
        const data = await res.json();

        if (data.error) {
            throw new Error(data.error);
        }

        logList.innerHTML = '';

        if (!data.logs || data.logs.length === 0) { // data.logs kontrolü eklendi
            logList.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Bu filtrelerle eşleşen uyarı bulunamadı.</p>';
        } else {
            data.logs.forEach(log => {
                const card = document.createElement('div');
                card.className = 'ceza-log-card';

                const statusClass = 'status-aktif';
                const statusText = 'Aktif';

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
                    </div>
                    <div class="ceza-timing">
                        <div class="time-item">
                            <span class="time-label">Uyarı Tarihi:</span>
                            <span class="time-value">${formatTimestamp(log.baslangic_tarihi)}</span>
                        </div>
                        <div class="time-item">
                             <span class="time-label">Süre:</span>
                            <span class="time-value">Kalıcı</span>
                        </div>
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
    // pagination null veya undefined olabilir, kontrol ekle
    if (!pagination) return;

    const { total_pages, current_page } = pagination;
    const paginationContainer = document.getElementById('pagination');
    paginationContainer.innerHTML = '';

    if (total_pages <= 1) {
        return;
    }

    const uyariTypeElement = document.getElementById('uyariTypeFilter');
    const currentUyariTipi = uyariTypeElement ? uyariTypeElement.value : 'uyari1,uyari2';


    const maxVisibleButtons = 5;
    const sideButtons = Math.floor(maxVisibleButtons / 2);

    const prevButton = document.createElement('button');
    prevButton.innerHTML = '&laquo;';
    prevButton.disabled = (current_page === 1);
    prevButton.onclick = () => loadLogs(current_page - 1);
    paginationContainer.appendChild(prevButton);

    let startPage = Math.max(1, current_page - sideButtons);
    let endPage = Math.min(total_pages, current_page + sideButtons);

    if (current_page - sideButtons < 1) {
        endPage = Math.min(total_pages, endPage + (1 - (current_page - sideButtons)));
    }
    if (current_page + sideButtons > total_pages) {
        startPage = Math.max(1, startPage - ((current_page + sideButtons) - total_pages));
    }

    if (startPage > 1) {
        const firstPageButton = document.createElement('button');
        firstPageButton.textContent = '1';
        firstPageButton.onclick = () => loadLogs(1);
        paginationContainer.appendChild(firstPageButton);
        if (startPage > 2) {
            const ellipsisSpan = document.createElement('span');
            ellipsisSpan.className = 'page-info';
            ellipsisSpan.textContent = '...';
            paginationContainer.appendChild(ellipsisSpan);
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        if (i === current_page) {
            pageButton.disabled = true;
            pageButton.classList.add('active');
        }
        pageButton.onclick = () => loadLogs(i);
        paginationContainer.appendChild(pageButton);
    }

    if (endPage < total_pages) {
        if (endPage < total_pages - 1) {
            const ellipsisSpan = document.createElement('span');
            ellipsisSpan.className = 'page-info';
            ellipsisSpan.textContent = '...';
            paginationContainer.appendChild(ellipsisSpan);
        }
        const lastPageButton = document.createElement('button');
        lastPageButton.textContent = total_pages;
        lastPageButton.onclick = () => loadLogs(total_pages);
        paginationContainer.appendChild(lastPageButton);
    }


    const nextButton = document.createElement('button');
    nextButton.innerHTML = '&raquo;';
    nextButton.disabled = (current_page === total_pages);
    nextButton.onclick = () => loadLogs(current_page + 1);
    paginationContainer.appendChild(nextButton);
}