document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('sortFilter').addEventListener('change', () => loadLogs(1));
    document.getElementById('userFilter').addEventListener('change', () => loadLogs(1));

    loadFilterData();
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


async function loadFilterData() {
    try {
        const res = await fetch(`../api.php?action=get_kes_log_users`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const userFilter = document.getElementById('userFilter');
        data.users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.executor_id;
            option.textContent = `${user.executor_tag} (${user.executor_id})`;
            userFilter.appendChild(option);
        });

    } catch (e) {
        console.error('Kullanıcı filtresi yüklenemedi:', e);
        showToast('Kullanıcı filtresi verileri yüklenemedi.');
    }
}

function translateStatus(status) {
    if (status && status.startsWith('SUCCESS')) {
        return '<span class="status-badge success">Başarılı</span>';
    }

    let statusText = 'Bilinmeyen Hata';
    let [failType, failReason] = (status || 'FAIL:UNKNOWN').split(':');
    failReason = (failReason || 'UNKNOWN').trim();

    switch (failReason) {
        case 'NO_TARGET_ID': statusText = 'Hedef ID Yok'; break;
        case 'TARGET_NOT_FOUND': statusText = 'Hedef Bulunamadı'; break;
        case 'AUTHOR_NOT_IN_VOICE': statusText = 'Seste Değil'; break;
        case 'TARGET_NOT_IN_VOICE': statusText = 'Hedef Seste Değil'; break;
        case 'ALREADY_IN_CHANNEL': statusText = 'Aynı Kanalda'; break;
        case 'CHANNEL_NOT_JOINABLE': statusText = 'Katılınamaz Kanal'; break;
        case 'BOT_NO_PERMISSION': statusText = 'Bot Yetkisi Yok'; break;
        case 'NO_PERMISSION': statusText = 'Yetki Yok'; break;
        default: statusText = `Hata: ${failReason}`; break;
    }
    return `<span class="status-badge fail" title="${statusText}">Başarısız</span>`;
}

function formatTimestamp(isoString) {
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) {
            return isoString;
        }

        const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        return date.toLocaleString('tr-TR', options);
    } catch (e) {
        return isoString;
    }
}

async function loadLogs(page = 1) {
    const logList = document.getElementById('logList');
    const paginationContainer = document.getElementById('pagination');

    logList.innerHTML = '<div class="spinner"></div>';
    paginationContainer.innerHTML = '';

    const sort = document.getElementById('sortFilter').value;
    const executor_id = document.getElementById('userFilter').value;

    try {
        const res = await fetch(`../api.php?action=get_kes_logs&page=${page}&sort=${sort}&executor_id=${executor_id}`);
        const data = await res.json();

        if (data.error) {
            throw new Error(data.error);
        }

        logList.innerHTML = '';

        if (data.logs.length === 0) {
            logList.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Bu filtrelerle eşleşen log bulunamadı.</p>';
        } else {
            data.logs.forEach(log => {
                const card = document.createElement('div');
                card.className = 'komut-log-card';

                const executorAvatar = log.executor_avatar || `https://cdn.discordapp.com/embed/avatars/${log.executor_id % 5}.png`;
                const executorTag = log.executor_tag || 'Bilinmiyor';

                let targetHtml = '<span style="color: var(--text-muted);">Yok</span>';
                if (log.target_id) {
                    const targetTag = log.target_tag || 'Bilinmiyor';
                    targetHtml = `<span class="target-tag">${targetTag}</span><span class="target-id" title="ID Kopyala" onclick="copyToClipboard('${log.target_id}', this)">(${log.target_id})</span>`;
                }

                card.innerHTML = `
                    <div class="komut-log-executor">
                        <div class="user-info">
                            <img src="${executorAvatar}" class="user-avatar" alt="Executor Avatar">
                            <div class="user-details">
                                <span class="user-tag">${executorTag}</span>
                                <span class="user-id" title="ID Kopyala" onclick="copyToClipboard('${log.executor_id}', this)">${log.executor_id}</span>
                            </div>
                        </div>
                    </div>

                    <div class="komut-log-details">
                        <div class="komut-detail-row">
                            <span class="komut-detail-label">Komut:</span>
                            <span class="komut-detail-value command">.${log.command_name}</span>
                        </div>
                        <div class="komut-detail-row">
                            <span class="komut-detail-label">Hedef:</span>
                            <span class="komut-detail-value target">${targetHtml}</span>
                        </div>
                    </div>

                    <div class="komut-log-status-time">
                        ${translateStatus(log.status)}
                        <span class="log-time">${formatTimestamp(log.timestamp)}</span>
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