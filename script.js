(() => {
  'use strict';

  // localStorageに使うキー(このツール専用の名前空間)
  const STORAGE_KEYS = {
    html: 'lc_cartridge_html',
    css: 'lc_cartridge_css',
    js: 'lc_cartridge_js',
    names: 'lc_cartridge_names',
    savedAt: 'lc_cartridge_saved_at',
  };

  const TYPES = ['html', 'css', 'js'];

  // 現在メモリ上に持っているコード
  const code = { html: '', css: '', js: '' };
  const names = { html: '', css: '', js: '' };

  const els = {
    runBtn: document.getElementById('runBtn'),
    clearBtn: document.getElementById('clearBtn'),
    logText: document.getElementById('logText'),
    previewFrame: document.getElementById('previewFrame'),
    previewState: document.getElementById('previewState'),
    cacheBadge: document.getElementById('cacheBadge'),
    cacheBadgeText: document.getElementById('cacheBadgeText'),
  };

  const dropEls = {};
  const nameEls = {};
  const inputEls = {};

  TYPES.forEach((t) => {
    dropEls[t] = document.getElementById(`drop-${t}`);
    nameEls[t] = document.getElementById(`name-${t}`);
    inputEls[t] = document.getElementById(`input-${t}`);
  });

  // ---------- ユーティリティ ----------

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'UTF-8');
    });
  }

  function extensionMatches(type, fileName) {
    const lower = fileName.toLowerCase();
    if (type === 'html') return lower.endsWith('.html') || lower.endsWith('.htm');
    if (type === 'css') return lower.endsWith('.css');
    if (type === 'js') return lower.endsWith('.js');
    return false;
  }

  function setLog(message) {
    els.logText.textContent = message;
  }

  function updateRunButtonState() {
    els.runBtn.disabled = code.html.trim().length === 0;
  }

  function markSlotLoaded(type, fileName) {
    nameEls[type].textContent = fileName;
    dropEls[type].classList.add('is-loaded');
  }

  function markSlotEmpty(type) {
    nameEls[type].textContent = 'ファイル未選択';
    dropEls[type].classList.remove('is-loaded');
  }

  function updateCacheBadge(hasCache, savedAt) {
    if (!hasCache) {
      els.cacheBadge.classList.remove('is-active');
      els.cacheBadgeText.textContent = 'キャッシュ未使用';
      return;
    }
    els.cacheBadge.classList.add('is-active');
    if (savedAt) {
      const d = new Date(Number(savedAt));
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      els.cacheBadgeText.textContent = `キャッシュ保持中(${hh}:${mm}保存)`;
    } else {
      els.cacheBadgeText.textContent = 'キャッシュ保持中';
    }
  }

  // ---------- 保存・復元 ----------

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.html, code.html);
      localStorage.setItem(STORAGE_KEYS.css, code.css);
      localStorage.setItem(STORAGE_KEYS.js, code.js);
      localStorage.setItem(STORAGE_KEYS.names, JSON.stringify(names));
      const savedAt = Date.now();
      localStorage.setItem(STORAGE_KEYS.savedAt, String(savedAt));
      updateCacheBadge(true, savedAt);
      return true;
    } catch (err) {
      setLog('保存に失敗しました(ブラウザの容量制限の可能性があります)。プレビューは実行できます。');
      return false;
    }
  }

  function loadFromStorage() {
    try {
      const savedHtml = localStorage.getItem(STORAGE_KEYS.html);
      if (!savedHtml) {
        updateCacheBadge(false);
        return false;
      }
      code.html = savedHtml || '';
      code.css = localStorage.getItem(STORAGE_KEYS.css) || '';
      code.js = localStorage.getItem(STORAGE_KEYS.js) || '';

      const savedNamesRaw = localStorage.getItem(STORAGE_KEYS.names);
      if (savedNamesRaw) {
        const savedNames = JSON.parse(savedNamesRaw);
        TYPES.forEach((t) => { names[t] = savedNames[t] || ''; });
      }

      TYPES.forEach((t) => {
        if (code[t]) markSlotLoaded(t, names[t] || `${t}(キャッシュ)`);
      });

      const savedAt = localStorage.getItem(STORAGE_KEYS.savedAt);
      updateCacheBadge(true, savedAt);
      setLog('前回のキャッシュを読み込みました。「実行する」で再プレビューできます。');
      return true;
    } catch (err) {
      updateCacheBadge(false);
      return false;
    }
  }

  function clearStorage() {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    TYPES.forEach((t) => {
      code[t] = '';
      names[t] = '';
      markSlotEmpty(t);
    });
    els.previewFrame.srcdoc = '';
    els.previewState.textContent = '未実行';
    updateCacheBadge(false);
    updateRunButtonState();
    setLog('キャッシュを削除しました。ファイルを選び直してください。');
  }

  // ---------- ファイル取り込み ----------

  async function handleIncomingFile(type, file) {
    if (!file) return;
    if (!extensionMatches(type, file.name)) {
      setLog(`「${file.name}」は${type.toUpperCase()}スロットの拡張子と一致しません。`);
      return;
    }
    try {
      const text = await readFileAsText(file);
      code[type] = text;
      names[type] = file.name;
      markSlotLoaded(type, file.name);
      updateRunButtonState();
      saveToStorage();
      setLog(`${type.toUpperCase()}を読み込みました(${file.name})。「実行する」でプレビューします。`);
    } catch (err) {
      setLog(`${type.toUpperCase()}の読み込みに失敗しました: ${err.message}`);
    }
  }

  // ---------- プレビュー実行 ----------

  function buildCombinedHtml() {
    let html = code.html;

    // <style>を</head>直前に差し込む(</head>がない場合は先頭に追加)
    const styleBlock = code.css ? `<style>\n${code.css}\n</style>` : '';
    if (styleBlock) {
      if (/<\/head>/i.test(html)) {
        html = html.replace(/<\/head>/i, `${styleBlock}\n</head>`);
      } else {
        html = styleBlock + '\n' + html;
      }
    }

    // <script>を</body>直前に差し込む(</body>がない場合は末尾に追加)
    const scriptBlock = code.js ? `<script>\n${code.js}\n<\/script>` : '';
    if (scriptBlock) {
      if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, `${scriptBlock}\n</body>`);
      } else {
        html = html + '\n' + scriptBlock;
      }
    }

    return html;
  }

  function runPreview() {
    if (!code.html.trim()) {
      setLog('HTMLファイルが未選択です。まずHTMLを読み込んでください。');
      return;
    }
    const combined = buildCombinedHtml();
    els.previewFrame.srcdoc = combined;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    els.previewState.textContent = `実行中(${hh}:${mm}:${ss})`;
  }

  // ---------- イベント登録 ----------

  TYPES.forEach((type) => {
    const dropEl = dropEls[type];
    const inputEl = inputEls[type];

    dropEl.addEventListener('click', () => inputEl.click());
    dropEl.setAttribute('tabindex', '0');
    dropEl.setAttribute('role', 'button');
    dropEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        inputEl.click();
      }
    });

    inputEl.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      handleIncomingFile(type, file);
      inputEl.value = '';
    });

    dropEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropEl.classList.add('is-dragover');
    });
    dropEl.addEventListener('dragleave', () => {
      dropEl.classList.remove('is-dragover');
    });
    dropEl.addEventListener('drop', (e) => {
      e.preventDefault();
      dropEl.classList.remove('is-dragover');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      handleIncomingFile(type, file);
    });
  });

  els.runBtn.addEventListener('click', runPreview);
  els.clearBtn.addEventListener('click', clearStorage);

  // ---------- 初期化 ----------

  const restored = loadFromStorage();
  updateRunButtonState();
  if (restored && code.html.trim()) {
    runPreview();
  }
})();
