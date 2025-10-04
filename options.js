/* options.js  2025-06-25  无语法错误版  Manifest V3 */

// --------------------  默认配置  --------------------
const DEFAULT_SETTINGS = {
  enableExtension:      true,
  enableContextMenu:    true,
  showNotifications:    true,
  enableBatchDownload:  true,
  downloadMode:        'auto',          // single / batch / auto
  maxBatchSize:        10,
  downloadDelay:       500,
  namingPattern:       'original',      // original / timestamp / domain / custom
  customNaming:        '{domain}_{timestamp}_{index}',
  addTimestamp:        false,
  savePath:            '',
  createFolder:        true,
  createDateFolder:    false,
  minWidth:            100,
  minHeight:           100,
  maxSize:             50,
  allowedFormats:      ['jpg', 'jpeg', 'png', 'gif', 'webp']
};

const DEFAULT_RULES = {
  'bilibili.com': [
    { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))@[^?]+(?:\\?.*)?$', replacement: '$1', desc: '移除B站参数' },
    { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))[?].*$',           replacement: '$1', desc: '移除查询串' }
  ],
  'weibo.com': [
    { pattern: '\\/thumbnail$', replacement: '',        desc: '去掉 thumbnail' },
    { pattern: '\\/small$',     replacement: '/large', desc: '换成 large' }
  ],
  'zhihu.com': [
    { pattern: '_([sm]|xs|md|lg)$', replacement: '', desc: '去掉知乎尺寸后缀' }
  ],
  'default': [
    { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))@[^?]+(?:\\?.*)?$', replacement: '$1', desc: '移除 @ 参数' },
    { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))[?].*$',           replacement: '$1', desc: '移除查询串' },
    { pattern: '[?&](width|height|size|format|quality)=\\d+',    replacement: '',   desc: '清尺寸参数', global: true },
    { pattern: '[?&]thumb(nail)?=',                              replacement: '',   desc: '清缩略标记', global: true }
  ]
};

// --------------------  运行时变量  --------------------
let settings = {};
let rules    = {};

// --------------------  初始化  --------------------
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadRules();
  bindEvents();
  switchTab('general');
  document.addEventListener('click', e => {
  if (e.target.classList.contains('nav-tab')) switchTab(e.target.dataset.tab);
});
});

// --------------------  读写存储  --------------------
async function loadSettings() {
  const res = await chrome.storage.sync.get('settings');
  settings = { ...DEFAULT_SETTINGS, ...(res.settings || {}) };
  applySettingsUI();
}

async function saveSettings() {
  await chrome.storage.sync.set({ settings });
}

async function loadRules() {
  const res = await chrome.storage.sync.get('originalImageRules');
  rules = { ...DEFAULT_RULES, ...(res.originalImageRules || {}) };
  renderRules();
}

async function saveRules() {
  await chrome.storage.sync.set({ originalImageRules: rules });
}

// --------------------  UI 应用  --------------------
function applySettingsUI() {
  Object.keys(settings).forEach(key => {
    const el = document.getElementById(key);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = settings[key];
    else el.value = settings[key];
  });

  // 自定义命名输入框显隐
  document.getElementById('customNamingGroup').style.display =
    settings.namingPattern === 'custom' ? 'block' : 'none';
}

// --------------------  事件绑定  --------------------
function bindEvents() {
  // 标签切换
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', e => switchTab(e.target.dataset.tab));
  });

  // 保存 / 重置
  document.getElementById('saveSettings').addEventListener('click', handleSave);
  document.getElementById('resetSettings').addEventListener('click', handleReset);

  // 命名模式变化
  document.getElementById('namingPattern').addEventListener('change', e => {
    document.getElementById('customNamingGroup').style.display =
      e.target.value === 'custom' ? 'block' : 'none';
  });

  // 规则相关
  document.getElementById('addRule').addEventListener('click', () => openRuleEditor());
  document.getElementById('testRule').addEventListener('click', handleTestRule);
  document.querySelectorAll('.preset-btn').forEach(btn =>
    btn.addEventListener('click', e => loadPresetRules(e.target.dataset.preset))
  );
}

// --------------------  标签切换  --------------------
function switchTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

// --------------------  保存 / 重置  --------------------
async function handleSave() {
  // 收集界面值
  const formKeys = [
    'enableExtension','enableContextMenu','showNotifications','enableBatchDownload',
    'downloadMode','maxBatchSize','downloadDelay','namingPattern','customNaming',
    'addTimestamp','savePath','createFolder','createDateFolder','minWidth','minHeight','maxSize'
  ];
  formKeys.forEach(k => {
    const el = document.getElementById(k);
    if (!el) return;
    settings[k] = el.type === 'checkbox' ? el.checked : el.value;
  });

  // allowedFormats
  settings.allowedFormats = Array.from(document.querySelectorAll('input[name="formats"]:checked'))
                                .map(cb => cb.value);

  await saveSettings();
  await saveRules();

  // 提示
  showToast('设置已保存');
}

async function handleReset() {
  if (!confirm('确定重置所有设置为默认值？')) return;
  settings = { ...DEFAULT_SETTINGS };
  rules    = { ...DEFAULT_RULES };
  applySettingsUI();
  renderRules();
  await saveSettings();
  await saveRules();
  showToast('已重置为默认设置');
}

// --------------------  规则渲染  --------------------
function renderRules() {
  const container = document.getElementById('rulesContainer');
  container.innerHTML = '';

  Object.entries(rules).forEach(([domain, list]) => {
    const card = document.createElement('div');
    card.className = 'rule-card';
    card.innerHTML = `
      <div class="rule-header">
        <span class="domain">${domain === 'default' ? '通用规则' : domain}</span>
        <div>
          <button class="btn btn-icon" data-domain="${domain}" data-action="edit">✏️</button>
          <button class="btn btn-icon" data-domain="${domain}" data-action="delete">🗑️</button>
        </div>
      </div>
      <div class="rule-list">
        ${list.map((r, i) => `
          <div class="rule-item">
            <code class="pattern">${r.pattern}</code>
            <span class="arrow">→</span>
            <code class="replacement">${r.replacement}</code>
            <span class="desc">${r.desc || ''}</span>
          </div>`).join('')}
      </div>`;
    container.appendChild(card);
  });

  // 绑定编辑 / 删除
  container.querySelectorAll('.btn-icon').forEach(btn =>
    btn.addEventListener('click', e => {
      const domain = e.target.dataset.domain;
      const action = e.target.dataset.action;
      if (action === 'delete') deleteRule(domain);
      else openRuleEditor(domain);
    })
  );
}

// --------------------  规则编辑  --------------------
function openRuleEditor(domain = null) {
  editingDomain = domain;
  const el = document.getElementById('ruleEditor');
  el.style.display = 'block';

  document.getElementById('ruleDomain').value = domain || '';
  // 简易一次性表单，保存时整体替换
  document.getElementById('saveRuleForm').onsubmit = async e => {
    e.preventDefault();
    const d = (document.getElementById('ruleDomain').value || 'default').trim();
    const p = document.getElementById('rulePattern').value.trim();
    const r = document.getElementById('ruleReplacement').value.trim();
    const desc = document.getElementById('ruleDesc').value.trim();
    if (!p) return;

    if (!rules[d]) rules[d] = [];
    rules[d].push({ pattern: p, replacement: r, desc });
    await saveRules();
    renderRules();
    el.style.display = 'none';
    showToast('规则已保存');
  };
  document.getElementById('cancelRuleForm').onclick = () => (el.style.display = 'none');
}

function deleteRule(domain) {
  if (!confirm(`删除域名 "${domain}" 下的所有规则？`)) return;
  delete rules[domain];
  saveRules();
  renderRules();
  showToast('规则已删除');
}

// --------------------  规则测试  --------------------
function handleTestRule() {
  const url = document.getElementById('testUrl').value.trim();
  if (!url) return;

  let processed = url;
  let matched = '无匹配规则';

  // 按域名找规则
  const u = new URL(url);
  const domain = u.hostname.replace(/^www\./, '');
  const list = rules[domain] || rules['default'] || [];

  for (const rule of list) {
    const re = new RegExp(rule.pattern, rule.global ? 'g' : '');
    if (re.test(url)) {
      processed = url.replace(re, rule.replacement);
      matched = `${domain}: ${rule.pattern}`;
      break;
    }
  }

  const box = document.getElementById('testResult');
  box.style.display = 'block';
  document.getElementById('originalUrl').textContent   = url;
  document.getElementById('processedUrl').textContent = processed;
  document.getElementById('matchedRule').textContent  = matched;
}

// --------------------  预设加载  --------------------
function loadPresetRules(preset) {
  const map = {
    bilibili: {
      'bilibili.com': [
        { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))@[^?]+(?:\\?.*)?$', replacement: '$1', desc: '移除B站参数' },
        { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))[?].*$',           replacement: '$1', desc: '移除查询串' }
      ]
    },
    weibo: {
      'weibo.com': [
        { pattern: '\\/thumbnail$', replacement: '',        desc: '去掉 thumbnail' },
        { pattern: '\\/small$',     replacement: '/large', desc: '换成 large' }
      ]
    },
    zhihu: {
      'zhihu.com': [
        { pattern: '_([sm]|xs|md|lg)$', replacement: '', desc: '去掉知乎尺寸后缀' }
      ]
    },
    default: {
      'default': [
        { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))@[^?]+(?:\\?.*)?$', replacement: '$1', desc: '移除 @ 参数' },
        { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))[?].*$',           replacement: '$1', desc: '移除查询串' },
        { pattern: '[?&](width|height|size|format|quality)=\\d+',    replacement: '',   desc: '清尺寸参数', global: true },
        { pattern: '[?&]thumb(nail)?=',                              replacement: '',   desc: '清缩略标记', global: true }
      ]
    }
  };
  if (!map[preset]) return;
  Object.assign(rules, map[preset]);
  saveRules();
  renderRules();
  showToast('已加载预设规则');
}

// --------------------  轻提示  --------------------
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}