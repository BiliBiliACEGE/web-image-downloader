/* background.js */
importScripts('libs/jszip.min.js');

const DEFAULT_RULES = {
  'bilibili.com': [
    {pattern: '(.+\\.(jpg|jpeg|png|gif|webp))@[^?]+(?:\\?.*)?$', replacement: '$1'},
    {pattern: '(.+\\.(jpg|jpeg|png|gif|webp))[?].*$', replacement: '$1'}
  ],
  'weibo.com': [
    {pattern: '\\/thumbnail$', replacement: ''},
    {pattern: '\\/small$', replacement: '/large'}
  ],
  'zhihu.com': [
    {pattern: '_([sm]|xs|md|lg)$', replacement: ''}
  ],
  'default': [
    {pattern: '(.+\\.(jpg|jpeg|png|gif|webp))@[^?]+(?:\\?.*)?$', replacement: '$1'},
    {pattern: '(.+\\.(jpg|jpeg|png|gif|webp))[?].*$', replacement: '$1'},
    {pattern: '[?&](width|height|size|format|quality)=\\d+', replacement: '', flags: 'g'},
    {pattern: '[?&]thumb(nail)?=', replacement: '', flags: 'g'}
  ]
};

chrome.runtime.onInstalled.addListener(async () => {
  const {originalImageRules} = await chrome.storage.sync.get('originalImageRules');
  if (!originalImageRules) await chrome.storage.sync.set({originalImageRules: DEFAULT_RULES});
  createMenus();
});

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({id: 'downloadOriginalImage', title: '下载原图', contexts: ['image']});
    chrome.contextMenus.create({id: 'viewOriginalImage',   title: '查看原图', contexts: ['image']});
    chrome.contextMenus.create({id: 'batchDownload', title: '下载页面所有图片', contexts: ['page']});
    chrome.contextMenus.create({id: 'batchZip',       parentId: 'batchDownload', title: '打包成 ZIP', contexts: ['page']});
    chrome.contextMenus.create({id: 'batchDomainDir', parentId: 'batchDownload', title: '按域名文件夹保存', contexts: ['page']});
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'downloadOriginalImage') {
    const url = await getOriginalUrl(info.srcUrl, tab.url);
    chrome.downloads.download({url, saveAs: false});
  }
  if (info.menuItemId === 'viewOriginalImage') {
    const url = await getOriginalUrl(info.srcUrl, tab.url);
    chrome.tabs.create({url, active: true});
  }
  if (info.menuItemId === 'batchZip')       return batchDownload(tab, 'zip');
  if (info.menuItemId === 'batchDomainDir') return batchDownload(tab, 'domain');
});

/* 统一批量处理：zip | domain */
async function batchDownload(tab, mode) {
  const {images} = await chrome.tabs.sendMessage(tab.id, {action: 'getAllImages'});
  if (!images || !images.length) return;

  const domain = new URL(tab.url).hostname.replace(/^www\./, '');
  const ts   = Date.now();

  if (mode === 'domain') {
    for (let i = 0; i < images.length; i++) {
      const raw = await getOriginalUrl(images[i], tab.url);
      const url = fixUrl(raw, tab.url);
      if (!url) continue;
      const ext = (url.match(/\.(\w{3,4})(?=\?|$)/) || [, 'jpg'])[1];
      chrome.downloads.download({url, filename: `${domain}/image_${i}.${ext}`, saveAs: false});
      await sleep(300);
    }
    return;
  }

  /* ZIP 模式 */
  const zip = new JSZip();
  const folder = zip.folder(domain);
  let index = 0;
  for (const src of images) {
    const raw = await getOriginalUrl(src, tab.url);
    const url = fixUrl(raw, tab.url);
    if (!url) continue;
    const ext = (url.match(/\.(\w{3,4})(?=\?|$)/) || [, 'jpg'])[1];
    try {
      const blob = await (await fetch(url, {referrer: tab.url})).blob();
      folder.file(`image_${index}.${ext}`, blob);
    } catch (e) {/* ignore */}
    index++;
  }
  const zipBlob = await zip.generateAsync({type: 'blob'});
  // 背景页不能用 URL.createObjectURL，改 FileReader → dataURL
  const reader = new FileReader();
  reader.onloadend = () => {
    const dataUrl = reader.result;
    chrome.downloads.download({
      url: dataUrl,
      filename: `${domain}_${ts}.zip`,
      saveAs: false
    });
  };
  reader.readAsDataURL(zipBlob);
}

/* 小工具 */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* URL 修复：相对路径、非法地址回退 */
function fixUrl(raw, base) {
  if (!raw) return null;
  if (raw.startsWith('//')) raw = 'https:' + raw;
  if (raw.startsWith('/')) raw = new URL(base).origin + raw;
  try { return new URL(raw).href; } catch { return null; }
}

/* 原图地址还原 */
async function getOriginalUrl(imageUrl, pageUrl) {
  const {originalImageRules} = await chrome.storage.sync.get('originalImageRules');
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