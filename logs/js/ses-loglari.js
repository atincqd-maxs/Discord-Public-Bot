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
        const res = await fetch(`../api.php?action=get_ses_log_users`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const userFilter = document.getElementById('userFilter');
        userFilter.innerHTML = '<option value="all">Tüm Kullanıcılar</option>';
        data.users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.user_id;
            option.textContent = `${user.user_tag || 'Bilinmiyor'} (${user.user_id})`;
            userFilter.appendChild(option);
        });

    } catch (e) {
        console.error('Kullanıcı filtresi yüklenemedi:', e);
        showToast('Kullanıcı filtresi verileri yüklenemedi.');
    }
}

function formatEventType(eventType) {
    if (eventType === 'JOIN') {
        return '<span class="event-badge event-join">Giriş</span>';
    } else if (eventType === 'LEAVE') {
         return '<span class="event-badge event-leave">Çıkış</span>';
    }
    return '';
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
        console.error("Tarih formatlama hatası:", e, "Gelen değer:", isoString);
        return isoString;
    }
}

function formatMembersList(membersListJson) {
    try {
        const data = JSON.parse(membersListJson || '{}');
        const members = data.members || [];
        const count = data.count || 0;
        const overLimit = data.overLimit || false;

        if (members.length === 0 && count === 0) {
             return `<span style="color:var(--text-muted); font-style: italic;">Kimse kalmadı</span>`;
        }

        let html = '<div class="members-grid">';
        members.forEach(member => {
            html += `
                <div class="member-item">
                    <img src="${member.avatar || `https://cdn.discordapp.com/embed/avatars/${member.id % 5}.png`}" class="member-avatar" alt="Avatar">
                    <div class="member-details">
                        <span class="member-name">${member.displayName}</span>
                        <span class="member-id" title="ID Kopyala" onclick="copyToClipboard('${member.id}', this)">(${member.id})</span>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        if (overLimit) {
            html += `<div style="color:var(--text-muted); font-size: 11px; margin-top: 5px;">**${members.length}'ten fazla üye bulunuyor.**</div>`;
        } else if (members.length === 0 && count > 0) {
             return `<span style="color:var(--text-muted); font-style: italic;">(Listede üye yok, eski veri?)</span>`;
        }

        return html;
    } catch (e) {
        console.error("Üye listesi JSON parse hatası:", e, "Gelen veri:", membersListJson);
        if(typeof membersListJson === 'string'){
             return membersListJson.replace(/\n/g, '<br>');
        }
        return '<span style="color:var(--status-fail);">Üye listesi işlenemedi.</span>';
    }
}


async function loadLogs(page = 1) {
    const logList = document.getElementById('logList');
    const paginationContainer = document.getElementById('pagination');

    logList.innerHTML = '<div class="spinner"></div>';
    paginationContainer.innerHTML = '';

    const sort = document.getElementById('sortFilter').value;
    const user_id = document.getElementById('userFilter').value;

    try {
        const res = await fetch(`../api.php?action=get_ses_logs&page=${page}&sort=${sort}&user_id=${user_id}`);
        const data = await res.json();

        if (data.error) {
            throw new Error(data.error);
        }

        logList.innerHTML = '';

        if (data.logs.length === 0) {
            logList.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Bu filtrelerle eşleşen ses logu bulunamadı.</p>';
        } else {
            data.logs.forEach(log => {
                const card = document.createElement('div');
                card.className = 'komut-log-card';

                const userAvatar = log.user_avatar || `https://cdn.discordapp.com/embed/avatars/${log.user_id % 5}.png`;
                const userTag = log.user_tag || 'Bilinmiyor';
                const channelName = log.channel_name || 'Bilinmeyen Kanal';
                const eventTypeText = log.event_type === 'JOIN' ? 'Girdi' : 'Çıktı';
                const membersListTitle = log.event_type === 'JOIN' ? 'Girdiği Kanalda Bulunan Üyeler:' : 'Çıktığı Kanalda Kalan Üyeler:';

                const channelDisplayHTML = `
                    <span style="display: inline-flex; align-items: center; gap: 4px; color: var(--interactive-hover); font-weight: 500;">
                        <svg aria-label="Ses Kanalı" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM15.1 20.75c-.58.14-1.1-.33-1.1-.92v-.03c0-.5.37-.92.85-1.05a7 7 0 0 0 0-13.5A1.11 1.11 0 0 1 14 4.2v-.03c0-.6.52-1.06 1.1-.92a9 9 0 0 1 0 17.5Z"></path>
                            <path d="M15.16 16.51c-.57.28-1.16-.2-1.16-.83v-.14c0-.43.28-.8.63-1.02a3 3 0 0 0 0-5.04c-.35-.23-.63-.6-.63-1.02v-.14c0-.63.59-1.1 1.16-.83a5 5 0 0 1 0 9.02Z"></path>
                        </svg>
                        ${channelName}
                    </span>
                `;

                // Icon URLs based on state
                const micIcon = log.user_mic_state
                    ? 'https://cdn3.emoji.gg/emojis/43295-voice-microphone-muted.png'
                    : 'https://cdn3.emoji.gg/emojis/43295-voice-microphone.png';
                const headphoneIcon = log.user_headphone_state
                    ? 'https://cdn3.emoji.gg/emojis/50050-voice-headphones-deafened-alt.png'
                    : 'https://cdn3.emoji.gg/emojis/8945-voice-headphones.png';
                const cameraIcon = log.user_camera_state
                    ? 'https://cdn3.emoji.gg/emojis/6730-voice-video.png' // Kamera açık ikonu
                    : 'https://cdn3.emoji.gg/emojis/97219-voice-video-disabled.png'; // Kamera kapalı ikonu

                // Status HTML with icons
                const statusHTML = `
                    <span style="display: inline-flex; align-items: center; gap: 5px; margin-right: 10px;">
                        <img src="${micIcon}" width="16" height="16" alt="Mic Status">
                        <span>${log.user_mic_state ? 'Kapalı' : 'Açık'}</span>
                    </span> |
                    <span style="display: inline-flex; align-items: center; gap: 5px; margin-left: 10px; margin-right: 10px;">
                        <img src="${headphoneIcon}" width="16" height="16" alt="Headphone Status">
                        <span>${log.user_headphone_state ? 'Kapalı' : 'Açık'}</span>
                    </span> |
                    <span style="display: inline-flex; align-items: center; gap: 5px; margin-left: 10px;">
                        <img src="${cameraIcon}" width="16" height="16" alt="Camera Status">
                        <span>${log.user_camera_state ? 'Açık' : 'Kapalı'}</span>
                    </span>
                `;

                card.innerHTML = `
                    <div class="komut-log-executor">
                        <div class="user-info">
                            <img src="${userAvatar}" class="user-avatar" alt="User Avatar">
                            <div class="user-details">
                                <span class="user-tag">${userTag}</span>
                                <span class="user-id" title="ID Kopyala" onclick="copyToClipboard('${log.user_id}', this)">${log.user_id}</span>
                            </div>
                        </div>
                    </div>

                    <div class="komut-log-details" style="gap: 8px;">
                        <div class="komut-detail-row">
                            <span class="komut-detail-label">Olay:</span>
                            <span class="komut-detail-value">${formatEventType(log.event_type)}</span>
                        </div>
                        <div class="komut-detail-row">
                            <span class="komut-detail-label">Kanal (${eventTypeText}):</span>
                            <span class="komut-detail-value" title="${channelName} (${log.channel_id})">${channelDisplayHTML}</span>
                        </div>
                         <div class="komut-detail-row">
                            <span class="komut-detail-label">Durumu (${eventTypeText}):</span>
                            <span class="komut-detail-value" style="font-size:12px;">
                                ${statusHTML}
                            </span>
                        </div>
                         <div class="komut-detail-row" style="align-items: flex-start;">
                            <span class="komut-detail-label">${membersListTitle}</span>
                            <div class="komut-detail-value">
                                ${formatMembersList(log.members_list)}
                            </div>
                        </div>
                    </div>

                    <div class="komut-log-status-time">
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