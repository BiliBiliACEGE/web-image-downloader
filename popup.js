document.addEventListener('DOMContentLoaded', () => {
  const downloadCurrentBtn = document.getElementById('downloadCurrent');
  const openOptionsBtn = document.getElementById('openOptions');
  const clearHistoryBtn = document.getElementById('clearHistory');
  const todayCountEl = document.getElementById('todayCount');
  const totalCountEl = document.getElementById('totalCount');
  const recentListEl = document.getElementById('recentList');

  // 加载统计数据
  loadStatistics();
  
  // 加载最近下载
  loadRecentDownloads();

  // 下载当前页面图片
  downloadCurrentBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    downloadCurrentBtn.disabled = true;
    downloadCurrentBtn.innerHTML = '<span class="icon">⏳</span> 正在获取...';
    
    chrome.tabs.sendMessage(tab.id, { action: 'getAllImages' }, async (response) => {
      if (response && response.images) {
        // 发送批量下载消息给后台脚本
        chrome.runtime.sendMessage({ 
          action: 'batchDownload', 
          images: response.images,
          tabUrl: tab.url 
        });
        
        // 更新统计
        updateStatistics(response.images.length);
      }
      
      downloadCurrentBtn.disabled = false;
      downloadCurrentBtn.innerHTML = '<span class="icon">⬇️</span> 下载当前页面图片';
    });
  });

  // 打开设置页面
  openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 清除历史记录
  clearHistoryBtn.addEventListener('click', () => {
    if (confirm('确定要清除所有下载历史吗？')) {
      chrome.storage.local.set({ 
        downloadHistory: [],
        statistics: { today: 0, total: 0, lastDate: new Date().toDateString() }
      }, () => {
        loadStatistics();
        loadRecentDownloads();
        showNotification('历史记录已清除');
      });
    }
  });

  // 加载统计数据
  function loadStatistics() {
    chrome.storage.local.get(['statistics'], (result) => {
      const stats = result.statistics || { today: 0, total: 0, lastDate: new Date().toDateString() };
      
      // 检查是否需要重置今日计数
      const today = new Date().toDateString();
      if (stats.lastDate !== today) {
        stats.today = 0;
        stats.lastDate = today;
        chrome.storage.local.set({ statistics: stats });
      }
      
      todayCountEl.textContent = stats.today;
      totalCountEl.textContent = stats.total;
    });
  }

  // 加载最近下载
  function loadRecentDownloads() {
    chrome.storage.local.get(['downloadHistory'], (result) => {
      const history = result.downloadHistory || [];
      
      if (history.length === 0) {
        recentListEl.innerHTML = '<div class="empty-state">暂无下载记录</div>';
        return;
      }
      
      // 显示最近5个下载
      const recent = history.slice(-5).reverse();
      recentListEl.innerHTML = recent.map(item => `
        <div class="recent-item">
          <img src="${item.url}" alt="缩略图" class="recent-thumb">
          <div class="recent-info">
            <div class="recent-name">${item.filename}</div>
            <div class="recent-time">${formatTime(item.timestamp)}</div>
          </div>
        </div>
      `).join('');
    });
  }

  // 更新统计
  function updateStatistics(count) {
    chrome.storage.local.get(['statistics'], (result) => {
      const stats = result.statistics || { today: 0, total: 0, lastDate: new Date().toDateString() };
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

  // 格式化时间
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return date.toLocaleDateString();
  }

  // 显示通知
  function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 2000);
  }
});