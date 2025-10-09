importScripts('libs/jszip.min.js');

const DEFAULT_RULES = {
  'bilibili.com': [
    { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))@[^?]+(?:\\?.*)?$', replacement: '$1' },
    { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))[?].*$', replacement: '$1' }
  ],
  'weibo.com': [
    { pattern: '\\/thumbnail$', replacement: '' },
    { pattern: '\\/small$', replacement: '/large' }
  ],
  'zhihu.com': [
    { pattern: '_([sm]|xs|md|lg)$', replacement: '' }
  ],
  'default': [
    { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))@[^?]+(?:\\?.*)?$', replacement: '$1' },
    { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))[?].*$', replacement: '$1' },
    { pattern: '[?&](width|height|size|format|quality)=\\d+', replacement: '', flags: 'g' },
    { pattern: '[?&]thumb(nail)?=', replacement: '', flags: 'g' }
  ]
};

function T(key) { return chrome.i18n.getMessage(key); }

chrome.runtime.onInstalled.addListener(async () => {
  const { originalImageRules } = await chrome.storage.sync.get('originalImageRules');
  if (!originalImageRules) await chrome.storage.sync.set({ originalImageRules: DEFAULT_RULES });
  createMenus();
});

/* 累加下载计数 */
function incrementDownloadCount(count = 1) {
  chrome.storage.local.get({ statistics: { today: 0, total: 0, lastDate: new Date().toDateString() } }, (r) => {
    let stats = r.statistics;
    const today = new Date().toDateString();
    if (stats.lastDate !== today) {
      stats.today = 0;
      stats.lastDate = today;
    }
    stats.today += count;
    stats.total += count;
    chrome.storage.local.set({ statistics: stats });
  });
}

async function createMenus() {
  await chrome.contextMenus.removeAll();
  /* 单图 */
  chrome.contextMenus.create({ id: 'downloadOriginalImage', title: T('ctxDownload'), contexts: ['image'] });
  chrome.contextMenus.create({ id: 'viewOriginalImage', title: T('ctxView'), contexts: ['image'] });
  /* 批量主菜单 */
  chrome.contextMenus.create({ id: 'batchDownload', title: T('ctxBatch'), contexts: ['page'] });
  /* 二级菜单：按域名文件夹保存 */
  chrome.contextMenus.create({ id: 'batchDomainDir', parentId: 'batchDownload', title: T('ctxDomain'), contexts: ['page'] });
  chrome.contextMenus.create({ id: 'batchZip', parentId: 'batchDownload', title: T('ctxZip'), contexts: ['page'] });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'downloadOriginalImage') {
    const url = await getOriginalUrl(info.srcUrl, tab.url);
    const filename = generateFileName(url, 'single');
    chrome.downloads.download({ url, filename, saveAs: false }, (id) => {
      if (!chrome.runtime.lastError) writeHistory(url, filename);
      incrementDownloadCount(1);
    });
  }
  if (info.menuItemId === 'viewOriginalImage') {
    const url = await getOriginalUrl(info.srcUrl, tab.url);
    chrome.tabs.create({ url, active: true });
  }
  if (info.menuItemId === 'batchZip') return batchDownload(tab, 'zip');
});

/* 轻提示 */
function showNotification(msg) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'Image Downloader',
    message: msg
  });
}

/* 批量下载（含历史写入） */
async function batchDownload(tab, mode) {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => { });
  const res = await chrome.tabs.sendMessage(tab.id, { action: 'getAllImages' });
  if (!res || !res.images || !res.images.length) return;

  const domain = new URL(tab.url).hostname.replace(/^www\./, '');
  const ts = Date.now();

  /* === 互斥分支 === */
  if (mode === 'domain') {
    /* 仅：按域名文件夹保存 */
    for (let i = 0; i < res.images.length; i++) {
      const raw = await getOriginalUrl(res.images[i], tab.url);
      const url = fixUrl(raw, tab.url);
      if (!url) continue;
      const ext = (url.match(/\.(\w{3,4})(?=\?|$)/) || [, 'jpg'])[1];
      const filename = `${domain}/image_${i}.${ext}`;
      chrome.downloads.download({ url, filename, saveAs: false }, (id) => {
        if (!chrome.runtime.lastError) writeHistory(url, filename);
        incrementDownloadCount(1);
      });
      await sleep(300);
    }
    return;
  }

  /* === 仅：打包 ZIP === */
  const zip = new JSZip();
  const folder = zip.folder(domain);
  let index = 0;
  for (const src of res.images) {
    const raw = await getOriginalUrl(src, tab.url);
    const url = fixUrl(raw, tab.url);
    if (!url) continue;
    const ext = (url.match(/\.(\w{3,4})(?=\?|$)/) || [, 'jpg'])[1];
    try {
      const blob = await (await fetch(url, { referrer: tab.url })).blob();
      folder.file(`image_${index}.${ext}`, blob);
    } catch { }
    index++;
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const reader = new FileReader();
  reader.onloadend = () => {
    const filenameZip = `${domain}_${ts}.zip`;
    chrome.downloads.download({ url: reader.result, filename: filenameZip, saveAs: false }, (id) => {
      if (!chrome.runtime.lastError) writeHistory(reader.result, filenameZip);
    });
  };
  reader.readAsDataURL(zipBlob);
}

function writeHistory(url, filename) {
  chrome.storage.local.get({ downloadHistory: [] }, (r) => {
    const list = r.downloadHistory;
    list.push({ url, filename, timestamp: Date.now() });
    if (list.length > 50) list.shift();
    chrome.storage.local.set({ downloadHistory: list });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fixUrl(raw, base) {
  if (!raw) return null;
  if (raw.startsWith('//')) raw = 'https:' + raw;
  if (raw.startsWith('/')) raw = new URL(base).origin + raw;
  try { return new URL(raw).href; } catch { return null; }
}

function generateFileName(url, mode) {
  const u = new URL(url);
  const orig = u.pathname.split('/').pop() || 'image';
  const ext = orig.match(/\.(\w{3,4})$/)?.[1] || 'jpg';
  return mode === 'single' ? orig : `${u.hostname}_${Date.now()}.${ext}`;
}

async function getOriginalUrl(imageUrl, pageUrl) {
  const { originalImageRules } = await chrome.storage.sync.get('originalImageRules');
  const rules = originalImageRules || DEFAULT_RULES;
  const domain = new URL(pageUrl).hostname.replace(/^www\./, '');
  const list = rules[domain] || rules['default'] || [];
  let url = imageUrl;
  for (const r of list) {
    const re = new RegExp(r.pattern, r.flags || '');
    url = url.replace(re, r.replacement);
  }
  return url;
}