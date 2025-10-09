function T(key) { return chrome.i18n.getMessage(key); }

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  loadStatistics();
  loadRecentDownloads();
  bindEvents();
});

function bindEvents() {
  document.getElementById('downloadCurrent').addEventListener('click', handleDownloadCurrent);
  document.getElementById('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('clearHistory').addEventListener('click', handleClearHistory);
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = T(el.dataset.i18n);
  });
}

function loadStatistics() {
  chrome.storage.local.get({ statistics: { today: 0, total: 0, lastDate: new Date().toDateString() } }, (result) => {
    let stats = result.statistics;
    const today = new Date().toDateString();
    if (stats.lastDate !== today) {
      stats.today = 0;
      stats.lastDate = today;
    }
    document.getElementById('todayCount').textContent = stats.today;
    document.getElementById('totalCount').textContent = stats.total;
  });
}

function loadRecentDownloads() {
  chrome.storage.local.get({ downloadHistory: [] }, (r) => {
    const list = r.downloadHistory.slice(-5).reverse();
    const html = list.length
      ? list.map(it => `
          <div class="recent-item">
            <img src="${it.url}" alt="thumb" class="recent-thumb"/>
            <div class="recent-info">
              <div class="recent-name">${it.filename}</div>
              <div class="recent-time">${new Date(it.timestamp).toLocaleString()}</div>
            </div>
          </div>`).join('')
      : `<div class="empty-state">${T('popEmpty')}</div>`;
    document.getElementById('recentList').innerHTML = html;
  });
}

function handleDownloadCurrent() {
  const btn = document.getElementById('downloadCurrent');
  btn.disabled = true;
  btn.innerHTML = `<span class="icon">⏳</span> ${T('popDownloading')}`;
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {});
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'getAllImages' });
    if (res && res.images) {
      chrome.runtime.sendMessage({ action: 'batchDownload', images: res.images, tabUrl: tab.url });
      updateStatistics(res.images.length);
    }
    btn.disabled = false;
    btn.innerHTML = `<span class="icon">⬇️</span> ${T('popDownload')}`;
  });
}

function handleClearHistory() {
  if (!confirm(T('popClearConfirm'))) return;
  chrome.storage.local.set({ downloadHistory: [], statistics: { today: 0, total: 0, lastDate: new Date().toDateString() } }, () => {
    loadStatistics();
    loadRecentDownloads();
    showToast(T('popCleared'));
  });
}

function updateStatistics(count) {
  chrome.storage.local.get({ statistics: { today: 0, total: 0, lastDate: new Date().toDateString() } }, (r) => {
    let stats = r.statistics;
    const today = new Date().toDateString();
    if (stats.lastDate !== today) {
      stats.today = count;
      stats.lastDate = today;
    } else {
      stats.today += count;
    }
    stats.total += count;
    chrome.storage.local.set({ statistics: stats }, () => {
      loadStatistics();
    });
  });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}