/* popup.js  多语言完整版 */
function T(key) { return chrome.i18n.getMessage(key); }

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = T(el.dataset.i18n);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();                       // 先填充语言
  loadStatistics();
  loadRecentDownloads();
  bindEvents();
});

function bindEvents() {
  const downloadBtn = document.getElementById('downloadCurrent');
  const openOptBtn  = document.getElementById('openOptions');
  const clearBtn    = document.getElementById('clearHistory');

  downloadBtn.addEventListener('click', handleDownloadCurrent);
  openOptBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  clearBtn.addEventListener('click', handleClearHistory);
}

/* 下载当前页所有图片 */
async function handleDownloadCurrent() {
  const btn = document.getElementById('downloadCurrent');
  btn.disabled = true;
  btn.innerHTML = `<span class="icon">⏳</span> ${T('popDownloading')}`;

  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  // 先注入脚本
  await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['content.js']}).catch(()=>{});
  const res = await chrome.tabs.sendMessage(tab.id, {action: 'getAllImages'});
  if (res && res.images) {
    chrome.runtime.sendMessage({action: 'batchDownload', images: res.images, tabUrl: tab.url});
    updateStatistics(res.images.length);
  }
  btn.disabled = false;
  btn.innerHTML = `<span class="icon">⬇️</span> ${T('popDownload')}`;
}

/* 清除历史 */
function handleClearHistory() {
  if (!confirm(T('popClearConfirm'))) return;
  chrome.storage.local.set({
    downloadHistory: [],
    statistics: {today: 0, total: 0, lastDate: new Date().toDateString()}
  }, () => {
    loadStatistics();
    loadRecentDownloads();
    showToast(T('popCleared'));
  });
}

/* 统计 & 最近下载 */
function loadStatistics() {
  chrome.storage.local.get(['statistics'], (r) => {
    const s = r.statistics || {today: 0, total: 0, lastDate: new Date().toDateString()};
    const today = new Date().toDateString();
    if (s.lastDate !== today) { s.today = 0; s.lastDate = today; }
    document.getElementById('todayCount').textContent = s.today;
    document.getElementById('totalCount').textContent = s.total;
  });
}

function loadRecentDownloads() {
  chrome.storage.local.get(['downloadHistory'], (r) => {
    const list = (r.downloadHistory || []).slice(-5).reverse();
    const html = list.length
      ? list.map(it => `
          <div class="recent-item">
            <img src="${it.url}" alt="thumb" class="recent-thumb"/>
            <div class="recent-info">
              <div class="recent-name">${it.filename}</div>
              <div class="recent-time">${formatTime(it.timestamp)}</div>
            </div>
          </div>`).join('')
      : `<div class="empty-state">${T('popEmpty')}</div>`;
    document.getElementById('recentList').innerHTML = html;
  });
}

function updateStatistics(count) {
  chrome.storage.local.get(['statistics'], (r) => {
    const s = r.statistics || {today: 0, total: 0, lastDate: new Date().toDateString()};
    const today = new Date().toDateString();
    if (s.lastDate !== today) { s.today = count; s.lastDate = today; }
    else s.today += count;
    s.total += count;
    chrome.storage.local.set({statistics: s}, () => loadStatistics());
  });
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - d;
  if (diff < 60000) return T('popJustNow');
  if (diff < 3600000) return Math.floor(diff / 60000) + T('popMinAgo');
  if (diff < 86400000) return Math.floor(diff / 3600000) + T('popHourAgo');
  return d.toLocaleDateString();
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}