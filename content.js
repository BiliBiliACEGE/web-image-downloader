// 监听来自后台脚本的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getAllImages') {
    const images = Array.from(document.images).map(img => img.src);
    sendResponse({ images: images });
  }
});

// 监听图片加载
document.addEventListener('DOMContentLoaded', () => {
  // 为所有图片添加右键菜单支持
  const images = document.querySelectorAll('img');
  images.forEach(img => {
    img.setAttribute('contextmenu', 'imageContextMenu');
  });
});