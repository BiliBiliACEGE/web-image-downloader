// 监听来自后台脚本的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getAllImages') {
    const imgs = Array.from(document.images).map(i => i.src).filter(Boolean);
    sendResponse({images: imgs});
    return true; // 保持通道开放
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