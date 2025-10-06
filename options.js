const DEFAULT_SETTINGS = {
  enableExtension: true,
  enableContextMenu: true,
  showNotifications: true,
  enableBatchDownload: true,
  downloadMode: 'direct',
  maxBatchSize: 10,
  downloadDelay: 500,
  namingPattern: 'original',
  customNaming: '{domain}_{timestamp}_{index}',
  addTimestamp: false,
  savePath: '',
  createFolder: true,
  createDateFolder: false,
  minWidth: 100,
  minHeight: 100,
  maxSize: 50,
  allowedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  language: 'auto'
};

const DEFAULT_RULES = {
  'bilibili.com': [
    { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))@[^?]+(?:\\?.*)?$', replacement: '$1', descKey: 'optDescBili' },
    { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))[?].*$',           replacement: '$1', descKey: 'optDescDef2' }
  ],
  'weibo.com': [
    { pattern: '\\/thumbnail$', replacement: '',        descKey: 'optDescWeibo' },
    { pattern: '\\/small$',     replacement: '/large', descKey: 'optDescWeibo2' }
  ],
  'zhihu.com': [
    { pattern: '_([sm]|xs|md|lg)$', replacement: '', descKey: 'optDescZhihu' }
  ],
  'default': [
    { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))@[^?]+(?:\\?.*)?$', replacement: '$1', descKey: 'optDescDef1' },
    { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))[?].*$',           replacement: '$1', descKey: 'optDescDef2' },
    { pattern: '[?&](width|height|size|format|quality)=\\d+',    replacement: '',   descKey: 'optDescDef3', global: true },
    { pattern: '[?&]thumb(nail)?=',                              replacement: '',   descKey: 'optDescDef4', global: true }
  ]
};

let settings = {};
let rules = {};
let editingDomain = null;
let editingIndex = null;

function T(key) { return chrome.i18n.getMessage(key); }

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadRules();
  applyI18n();
  bindEvents();
  switchTab('general');
  const userLang = settings.language !== 'auto' ? settings.language : chrome.i18n.getUILanguage();
  if (!location.href.includes('?lang=' + userLang)) {
    location.href = location.pathname + '?lang=' + userLang;
  }
});

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

function applySettingsUI() {
  Object.keys(settings).forEach(key => {
    const el = document.getElementById(key);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = settings[key];
    else el.value = settings[key];
  });
  document.getElementById('customNamingGroup').style.display = settings.namingPattern === 'custom' ? 'block' : 'none';
  document.getElementById('languageSelect').value = settings.language || 'auto';
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = T(el.dataset.i18n);
  });
}

function bindEvents() {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', e => switchTab(e.target.dataset.tab));
  });
  document.getElementById('saveSettings').addEventListener('click', handleSave);
  document.getElementById('resetSettings').addEventListener('click', handleReset);
  document.getElementById('namingPattern').addEventListener('change', e => {
    document.getElementById('customNamingGroup').style.display = e.target.value === 'custom' ? 'block' : 'none';
  });
  document.getElementById('addRule').addEventListener('click', () => openRuleEditor());
  document.getElementById('testRule').addEventListener('click', handleTestRule);
  document.querySelectorAll('.preset-btn').forEach(btn =>
    btn.addEventListener('click', e => loadPresetRules(e.target.dataset.preset))
  );
  document.getElementById('languageSelect').addEventListener('change', async (e) => {
    settings.language = e.target.value;
    await saveSettings();
    document.getElementById('langHelp').style.display = 'block';
  });
  document.getElementById('closeEditor').onclick = () => {
    document.getElementById('ruleEditor').style.display = 'none';
  };
  document.getElementById('cancelRuleForm').onclick = () => {
    document.getElementById('ruleEditor').style.display = 'none';
  };
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

async function handleSave() {
  const formKeys = [
    'enableExtension','enableContextMenu','showNotifications','enableBatchDownload',
    'downloadMode','maxBatchSize','downloadDelay','namingPattern','customNaming',
    'addTimestamp','savePath','createFolder','createDateFolder','minWidth','minHeight','maxSize','language'
  ];
  formKeys.forEach(k => {
    const el = document.getElementById(k);
    if (!el) return;
    settings[k] = el.type === 'checkbox' ? el.checked : el.value;
  });
  settings.allowedFormats = Array.from(document.querySelectorAll('input[name="formats"]:checked')).map(cb => cb.value);
  await saveSettings();
  await saveRules();
  showToast(T('optRuleSaved'));
}

async function handleReset() {
  if (!confirm(T('optResetConfirm'))) return;
  settings = { ...DEFAULT_SETTINGS };
  rules = { ...DEFAULT_RULES };
  applySettingsUI();
  renderRules();
  await saveSettings();
  await saveRules();
  showToast(T('optResetDone'));
}

function renderRules() {
  const container = document.getElementById('rulesContainer');
  container.innerHTML = '';
  Object.entries(rules).forEach(([domain, list]) => {
    const card = document.createElement('div');
    card.className = 'rule-card';
    card.innerHTML = `
      <div class="rule-header">
        <span class="domain">${domain === 'default' ? T('optGeneralRule') : domain}</span>
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
            <span class="desc">${r.descKey ? T(r.descKey) : (r.desc || '')}</span>
          </div>`).join('')}
      </div>`;
    container.appendChild(card);
  });
  container.querySelectorAll('.btn-icon').forEach(btn =>
    btn.addEventListener('click', e => {
      const domain = e.target.dataset.domain;
      const action = e.target.dataset.action;
      if (action === 'delete') deleteRule(domain);
      else {
        const idx = Array.from(e.target.parentElement.parentElement.parentElement.querySelectorAll('.btn-icon')).indexOf(e.target);
        openRuleEditor(domain, idx);
      }
    })
  );
}

function openRuleEditor(domain = null, ruleIndex = null) {
  editingDomain = domain;
  editingIndex = ruleIndex;
  const el = document.getElementById('ruleEditor');
  el.style.display = 'flex';
  document.getElementById('ruleDomain').value = domain || '';
  document.getElementById('rulePattern').value = '';
  document.getElementById('ruleReplacement').value = '';
  document.getElementById('ruleDesc').value = '';
  if (domain !== null && ruleIndex !== null) {
    const rule = rules[domain][ruleIndex];
    document.getElementById('ruleDomain').value = domain;
    document.getElementById('rulePattern').value = rule.pattern;
    document.getElementById('ruleReplacement').value = rule.replacement;
    document.getElementById('ruleDesc').value = rule.desc || '';
  }
}

function deleteRule(domain) {
  if (!confirm(T('optDeleteConfirm'))) return;
  delete rules[domain];
  saveRules();
  renderRules();
  showToast(T('optRuleDeleted'));
}

function handleTestRule() {
  const url = document.getElementById('testUrl').value.trim();
  if (!url) return;
  let processed = url;
  let matched = T('optNoMatch');
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
  document.getElementById('originalUrl').textContent = url;
  document.getElementById('processedUrl').textContent = processed;
  document.getElementById('matchedRule').textContent = matched;
}

function loadPresetRules(preset) {
  const map = {
    bilibili: {
      'bilibili.com': [
        { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))@[^?]+(?:\\?.*)?$', replacement: '$1', descKey: 'optDescBili' },
        { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))[?].*$',           replacement: '$1', descKey: 'optDescDef2' }
      ]
    },
    weibo: {
      'weibo.com': [
        { pattern: '\\/thumbnail$', replacement: '',        descKey: 'optDescWeibo' },
        { pattern: '\\/small$',     replacement: '/large', descKey: 'optDescWeibo2' }
      ]
    },
    zhihu: {
      'zhihu.com': [
        { pattern: '_([sm]|xs|md|lg)$', replacement: '', descKey: 'optDescZhihu' }
      ]
    },
    default: {
      'default': [
        { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))@[^?]+(?:\\?.*)?$', replacement: '$1', descKey: 'optDescDef1' },
        { pattern: '(.+\\.(jpg|jpeg|png|gif|webp))[?].*$',           replacement: '$1', descKey: 'optDescDef2' },
        { pattern: '[?&](width|height|size|format|quality)=\\d+',    replacement: '',   descKey: 'optDescDef3', global: true },
        { pattern: '[?&]thumb(nail)?=',                              replacement: '',   descKey: 'optDescDef4', global: true }
      ]
    }
  };
  if (!map[preset]) return;
  Object.assign(rules, map[preset]);
  saveRules();
  renderRules();
  showToast(T('optPresetLoaded'));
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}