/* background.js 最小可运行版 */
const DEFAULT_RULES = {
  'bilibili.com': [
    {pattern:'(.+\\.(jpg|jpeg|png|gif|webp))@[^?]+(?:\\?.*)?$',replacement:'$1'},
    {pattern:'(.+\\.(jpg|jpeg|png|gif|webp))[?].*$',replacement:'$1'}
  ],
  'weibo.com': [
    {pattern:'\\/thumbnail$',replacement:''},
    {pattern:'\\/small$',replacement:'/large'}
  ],
  'zhihu.com': [
    {pattern:'_([sm]|xs|md|lg)$',replacement:''}
  ],
  'default': [
    {pattern:'(.+\\.(jpg|jpeg|png|gif|webp))@[^?]+(?:\\?.*)?$',replacement:'$1'},
    {pattern:'(.+\\.(jpg|jpeg|png|gif|webp))[?].*$',replacement:'$1'},
    {pattern:'[?&](width|height|size|format|quality)=\\d+','replacement':'','flags':'g'},
    {pattern:'[?&]thumb(nail)?=','replacement':'','flags':'g'}
  ]
};

chrome.runtime.onInstalled.addListener(async () => {
  // 首次写入默认规则
  const {originalImageRules} = await chrome.storage.sync.get('originalImageRules');
  if (!originalImageRules) {
    await chrome.storage.sync.set({originalImageRules: DEFAULT_RULES});
  }
  createMenus();          // 创建右键菜单
});

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'downloadOriginalImage',
      title: '下载原图',
      contexts: ['image']
    });
    chrome.contextMenus.create({
      id: 'downloadAllImages',
      title: '下载页面所有图片',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'viewOriginalImage',
      title: '查看原图',
      contexts: ['image']
});
  });
}

// 点击菜单
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'downloadOriginalImage') {
    const url = await getOriginalUrl(info.srcUrl, tab.url);
    chrome.downloads.download({url, saveAs: false});
  }
  if (info.menuItemId === 'downloadAllImages') {
    const imgs = await chrome.tabs.sendMessage(tab.id, {action: 'getAllImages'});
    if (imgs && imgs.images) {
      for (const u of imgs.images) {
        const original = await getOriginalUrl(u, tab.url);
        chrome.downloads.download({url: original, saveAs: false});
      }
    }
  }
  if (info.menuItemId === 'viewOriginalImage') {
  const originalUrl = await getOriginalUrl(info.srcUrl, tab.url);
  chrome.tabs.create({ url: originalUrl, active: true });
}
});

// 根据规则还原原图地址
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