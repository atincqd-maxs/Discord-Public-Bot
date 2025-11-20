document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('sortFilter').addEventListener('change', () => loadLogs(1));
    document.getElementById('moderatorFilter').addEventListener('change', () => loadLogs(1));

    loadModeratorFilterData();
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


async function loadModeratorFilterData() {
    try {
        const res = await fetch(`../api.php?action=get_kayit_moderators`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const moderatorFilter = document.getElementById('moderatorFilter');
        moderatorFilter.innerHTML = '<option value="all">Tüm Yetkililer</option>';
        data.users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.moderator_id;
            option.textContent = `${user.moderator_tag || 'Bilinmiyor'} (${user.moderator_id})`;
            moderatorFilter.appendChild(option);
        });

    } catch (e) {
        console.error('Kaydeden Yetkili filtresi yüklenemedi:', e);
        showToast('Kaydeden Yetkili filtresi verileri yüklenemedi.');
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

function getGenderText(gender) {
    if (gender === 'erkek') return '<span class="ceza-tipi-tag ceza-other" style="background-color: rgba(88, 101, 242, 0.3); color: #5865f2;">Erkek</span>';
    if (gender === 'kadin') return '<span class="ceza-tipi-tag ceza-other" style="background-color: rgba(233, 30, 99, 0.3); color: #e91e63;">Kadın</span>';
    return `<span class="ceza-tipi-tag ceza-other">${(gender || '?').toUpperCase()}</span>`;
}


async function loadLogs(page = 1) {
    const logList = document.getElementById('logList');
    const paginationContainer = document.getElementById('pagination');

    logList.innerHTML = '<div class="spinner"></div>';
    paginationContainer.innerHTML = '';

    const sort = document.getElementById('sortFilter').value;
    const moderator_id = document.getElementById('moderatorFilter').value;

    try {
        const apiUrl = `../api.php?action=get_kayit_logs&page=${page}&sort=${sort}&moderator_id=${moderator_id}`;
        const res = await fetch(apiUrl);
        const data = await res.json();

        if (data.error) {
            throw new Error(data.error);
        }

        logList.innerHTML = '';

        if (data.logs.length === 0) {
            logList.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Bu filtrelerle eşleşen kayıt logu bulunamadı.</p>';
        } else {
            data.logs.forEach(log => {
                const card = document.createElement('div');
                card.className = 'ceza-log-card';

                const userAvatar = log.user_avatar || `https://cdn.discordapp.com/embed/avatars/${log.user_id % 5}.png`;
                const modAvatar = log.moderator_avatar || `https://cdn.discordapp.com/embed/avatars/${log.moderator_id % 5}.png`;
                const userTagDisplay = log.user_tag || 'Bilinmiyor';
                const modTagDisplay = log.moderator_tag || 'Bilinmiyor';

                card.innerHTML = `
                    <div class="ceza-header">
                        ${getGenderText(log.gender)}
                        <span class="ceza-id" style="margin-left: 10px;">Kayıt ID: #${log.id}</span>
                    </div>
                    <div class="ceza-users">
                        <div class="user-info">
                            <img src="${modAvatar}" class="user-avatar" alt="Mod Avatar">
                            <div class="user-details">
                                <span class="user-tag">${modTagDisplay}</span>
                                <span class="user-id" title="ID Kopyala" onclick="copyToClipboard('${log.moderator_id}', this)">${log.moderator_id}</span>
                            </div>
                            <span class="user-role-label">Kaydeden Yetkili</span>
                        </div>
                        <span class="arrow-icon material-icons-outlined">arrow_forward</span>
                        <div class="user-info">
                            <img src="${userAvatar}" class="user-avatar" alt="User Avatar">
                            <div class="user-details">
                                <span class="user-tag">${userTagDisplay}</span>
                                <span class="user-id" title="ID Kopyala" onclick="copyToClipboard('${log.user_id}', this)">${log.user_id}</span>
                            </div>
                             <span class="user-role-label">Kaydedilen Kullanıcı</span>
                        </div>
                    </div>
                    <div class="ceza-details">
                        <div class="detail-item">
                            <span class="detail-label">Uygulanan İsim:</span>
                            <span class="detail-value reason">${log.new_nickname || 'Bilinmiyor'}</span>
                        </div>
                    </div>
                     <div class="ceza-timing">
                        <div class="time-item">
                            <span class="time-label">Kayıt Zamanı:</span>
                            <span class="time-value">${formatTimestamp(log.timestamp)}</span>
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
    const { total_pages, current_page } = pagination;
    const paginationContainer = document.getElementById('pagination');
    paginationContainer.innerHTML = '';

    if (total_pages <= 1) {
        return;
    }

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