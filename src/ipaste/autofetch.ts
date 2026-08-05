import { jsMessages as messages } from '@i18n/js-messages';
import {
  createAppState, bindCommonButtons, initBookmark, setErrMsg,
  setSyncStatus, setResultText, getResultText, getPlainText, encryptContent, encryptFileContent,
  showBuildInfo, initSquircle, applyComputePrivkeyBtnSquircle,
  hideFileLocked, bindFilePaste, showFileLocked, enterFileModeUI, exitFileMode,
} from './common';
import { GoogleDriveManager } from './gdrive';

// --- History ---

export interface HistoryItem {
  timeString: string;
  note: string;
  expire: string | null;
}

export async function fetchHistoryList(ec: any, pubkey: string, salt: string): Promise<HistoryItem[]> {
  const key = encodeURIComponent(await generateKey(ec, pubkey, salt));
  const url = `https://vault10.kr7y.workers.dev/${key}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch history');
  const data = await response.json();
  return data.data || [];
}

export async function fetchHistoryDetail(ec: any, pubkey: string, salt: string, timeString: string): Promise<string> {
  const key = encodeURIComponent(await generateKey(ec, pubkey, salt));
  const url = `https://vault10.kr7y.workers.dev/${key}/${encodeURIComponent(timeString)}?fmt=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch detail');
  const data = await response.json();
  return data.content || '';
}

async function generateKey(ec: any, pubkey: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const prkKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pubkey),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const prk = await crypto.subtle.sign("HMAC", prkKey, encoder.encode(salt));
  const keyKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(prk),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const keyBuffer = await crypto.subtle.sign("HMAC", keyKey, encoder.encode("cloudflare-d1-access"));
  const keyArray = new Uint8Array(keyBuffer).slice(0, 33);
  return ec.base64Encode(keyArray, 1);
}

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return isoStr;
  }
}

function formatExpire(timeString: string, expire: string | null): string | null {
  if (expire == null || expire === '-1') return null;
  const expireTs = parseInt(expire);
  if (isNaN(expireTs) || expireTs <= 0) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date(expireTs * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function renderHistoryList(ec: any, state: any, items: HistoryItem[]) {
  const container = document.getElementById('historyList');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<div class="history-empty">${messages.loadEmpty}</div>`;
    return;
  }

  container.innerHTML = '';
  items.forEach((item) => {
    const expireStr = formatExpire(item.timeString, item.expire);
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="history-item-time">${formatTime(item.timeString)}</div>
      <div class="history-item-note">${item.note || '(no note)'}</div>
      ${expireStr ? `<div class="history-item-expire">过期: ${expireStr}</div>` : ''}
    `;
    div.onclick = () => handleHistoryClick(ec, state, item, div);
    container.appendChild(div);
  });
}

async function handleHistoryClick(ec: any, state: any, item: HistoryItem, el: HTMLElement) {
  if (!state.G_Input?.pubkey || !state.G_Input?.salt) {
    setErrMsg(messages.errNeedBookmark);
    return;
  }

  document.querySelectorAll('.history-item').forEach(e => e.classList.remove('active'));
  el.classList.add('active');

  const btnTitle = el.querySelector('.history-item-note') as HTMLElement;
  const originalText = btnTitle?.textContent;
  if (btnTitle) btnTitle.textContent = 'Loading...';
  el.style.pointerEvents = 'none';

  try {
    const content = await fetchHistoryDetail(ec, state.G_Input.pubkey, state.G_Input.salt, item.timeString);
    if (content) {
      const resultEl = document.getElementById("resultText") as HTMLTextAreaElement;
      if (resultEl) resultEl.value = content;
    }
  } catch (error) {
    setErrMsg('Failed to load: ' + (error as Error).message);
  } finally {
    if (btnTitle) btnTitle.textContent = originalText;
    el.style.pointerEvents = '';
  }
}

export async function autoFetchHistory(ec: any, state: any) {
  const container = document.getElementById('historyList');
  if (!container) return;

  if (!state.G_Input?.pubkey || !state.G_Input?.salt) {
    container.innerHTML = `<div class="history-empty">${messages.errNeedBookmark}</div>`;
    return;
  }

  container.innerHTML = `<div class="history-loading">${messages.historyLoading}</div>`;

  try {
    const historyItems = await fetchHistoryList(ec, state.G_Input.pubkey, state.G_Input.salt);
    renderHistoryList(ec, state, historyItems);
  } catch (error) {
    console.error('Error fetching history:', error);
    const err = error as Error;
    let msg = messages.historyFetchFailed;
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('Network request failed')) {
      msg = messages.historyFetchFailedCors;
    }
    container.innerHTML = `<div class="history-empty">${msg}</div>`;
  }
}

export async function fetchLatestContent(ec: any, pubkey: string, salt: string): Promise<string> {
  const key = encodeURIComponent(await generateKey(ec, pubkey, salt));
  const url = `https://vault10.kr7y.workers.dev/${key}/latest?fmt=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch latest content');
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return data.content || '';
  } catch {
    return text;
  }
}

export function bindHistoryRefreshBtn(ec: any, state: any) {
  const btn = document.getElementById('historyRefreshBtn');
  if (!btn) return;
  btn.onclick = () => autoFetchHistory(ec, state);
}

// --- Google Drive History ---

export async function autoFetchGDriveHistory(ec: any, state: any) {
  const container = document.getElementById('gdriveHistoryList');
  if (!container) return;

  try {
    const manager = getGDriveManager();
    if (!manager.isAuthorized()) {
      container.innerHTML = `<div class="history-empty">${messages.gdriveStatusReady}</div>`;
      return;
    }

    container.innerHTML = `<div class="history-loading">${messages.historyLoading}</div>`;
    const files = await manager.listBackups(state.G_Input.pubkey, state.G_Input.salt, ec);

    if (!files.length) {
      container.innerHTML = `<div class="history-empty">${messages.gdriveNoFiles}</div>`;
      return;
    }

    container.innerHTML = '';
    files.forEach((f) => {
      const div = document.createElement('div');
      div.className = 'history-item';

      let note = f.description || f.name;
      try {
        const obj = JSON.parse(f.description || '');
        if (obj.note) note = obj.note;
      } catch {}

      const date = new Date(f.modifiedTime);
      const dateStr = date.toLocaleString();
      const isFile = f.description?.includes('"ft":"F"');

      div.innerHTML = `
        <div class="history-item-time">${dateStr}</div>
        <div class="history-item-note">${note}</div>
        ${isFile ? '<div class="history-item-expire">File</div>' : ''}
      `;
      div.onclick = () => handleGDriveHistoryClick(ec, state, f, div);
      container.appendChild(div);
    });
  } catch (error) {
    console.error('Error fetching GDrive history:', error);
    container.innerHTML = `<div class="history-empty">${messages.gdriveLoadFailed}</div>`;
  }
}

async function handleGDriveHistoryClick(ec: any, state: any, file: any, el: HTMLElement) {
  document.querySelectorAll('#gdriveHistoryList .history-item').forEach(e => e.classList.remove('active'));
  el.classList.add('active');

  const btnTitle = el.querySelector('.history-item-note') as HTMLElement;
  const originalText = btnTitle?.textContent;
  if (btnTitle) btnTitle.textContent = 'Loading...';
  el.style.pointerEvents = 'none';

  try {
    const manager = getGDriveManager();
    const content = await manager.readBackup(file.id);
    if (content) {
      if (content.startsWith('F.')) {
        let fileName = 'decrypted-file';
        try {
          const obj = JSON.parse(file.description || '');
          if (obj.note) fileName = obj.note;
        } catch {}
        enterFileModeUI(state, fileName, content);
        hideFileLocked();
        const decryptBtn = document.getElementById("decryptBtn");
        if (decryptBtn) {
          decryptBtn.style.display = '';
          const btnTitle = decryptBtn.querySelector('.btnTitle');
          if (btnTitle) btnTitle.textContent = messages.btnDecryptText;
        }
        setSyncStatus(messages.gdriveLoadSuccessFile);
      } else {
        if (state.fileMode) exitFileMode(state);
        setResultText(content);
        setSyncStatus(messages.gdriveLoadSuccess);
      }
    }
  } catch (error) {
    setErrMsg('Failed to load: ' + (error as Error).message);
  } finally {
    if (btnTitle) btnTitle.textContent = originalText;
    el.style.pointerEvents = '';
  }
}

export function bindGDriveHistoryRefreshBtn(ec: any, state: any) {
  const btn = document.getElementById('gdriveRefreshBtn');
  if (!btn) return;
  btn.onclick = async () => {
    const manager = getGDriveManager();
    // Try to authorize when user manually clicks refresh
    if (!manager.isAuthorized()) {
      try {
        await manager.authorize();
      } catch {
        return;
      }
    }
    autoFetchGDriveHistory(ec, state);
  };
}

// --- Google Drive ---

const GDRIVE_CLIENT_ID = '181745577501-dj4fpc5lks5seruejnh7ftkvkv4odgit.apps.googleusercontent.com';
let gdrive: GoogleDriveManager | null = null;

function getGDriveManager(): GoogleDriveManager {
  if (!gdrive) {
    gdrive = new GoogleDriveManager(GDRIVE_CLIENT_ID);
  }
  return gdrive;
}

async function bindGoogleDriveSaveBtn(ec: any, state: any) {
  const btn = document.getElementById('saveToGDrive');
  if (!btn) return;

  btn.onclick = async () => {
    const pubkey = state.G_Input?.pubkey;
    const salt = state.G_Input?.salt;
    if (!pubkey || !salt) {
      setErrMsg(messages.errNeedBookmark);
      return;
    }

    try {
      const manager = getGDriveManager();
      setSyncStatus(messages.gdriveLoading || 'Saving...');

      if (state.fileMode && state.fileData) {
        // === File mode ===
        const file = state.fileData;
        const fileBytes = new Uint8Array(await file.arrayBuffer());
        const ciphertext = await encryptFileContent(ec, fileBytes, pubkey, salt);
        const desc = JSON.stringify({ note: file.name, ft: "F" });
        await manager.saveBackup(ec, file.name, ciphertext, pubkey, salt, desc);
        showFileLocked();
        setSyncStatus(messages.gdriveSaveSuccessFile);
      } else {
        // === Text mode ===
        const plainText = getPlainText()?.trim();
        if (!plainText) {
          setErrMsg(messages.errEmptyContent);
          return;
        }
        const ciphertext = await encryptContent(ec, plainText, pubkey, salt);
        setResultText(ciphertext);
        const descInput = (document.getElementById('gdriveDesc') as HTMLInputElement)?.value?.trim() || '';
        if (!descInput) {
          setErrMsg(messages.gdriveDescRequired);
          return;
        }
        const description = JSON.stringify({ note: descInput, ft: "N" });
        await manager.saveBackup(ec, plainText, ciphertext, pubkey, salt, description);
        setSyncStatus(messages.gdriveSaveSuccess);
      }
    } catch (error) {
      const errMsg = (error as Error).message;
      setErrMsg(errMsg.includes('Google authorization') ? messages.gdriveAuthFailed : `${messages.gdriveSaveFailed}: ${errMsg}`);
    }
  };
}

async function bindGoogleDriveLoadBtn(ec: any, state: any) {
  const btn = document.getElementById('loadFromGDrive');
  if (!btn) return;

  btn.onclick = async () => {
    const pubkey = state.G_Input?.pubkey;
    const salt = state.G_Input?.salt;
    if (!pubkey || !salt) {
      setErrMsg(messages.errNeedBookmark);
      return;
    }

    try {
      const manager = getGDriveManager();
      setSyncStatus(messages.gdriveLoading || 'Loading from Google Drive...');
      const files = await manager.listBackups(pubkey, salt, ec);

      if (files.length === 0) {
        setErrMsg(messages.gdriveNoFiles);
        setSyncStatus('');
        return;
      }

      // Build a simple file selection dialog
      const selectedFile = await showFilePicker(files);
      if (!selectedFile) {
        setSyncStatus('');
        return;
      }

      const content = await manager.readBackup(selectedFile.id);
      if (content) {
        if (content.startsWith('F.')) {
          // Extract note from description for filename
          let fileName = 'decrypted-file';
          try {
            const desc = selectedFile.description || '';
            const obj = JSON.parse(desc);
            if (obj.note) fileName = obj.note;
          } catch {}
          enterFileModeUI(state, fileName, content);
          hideFileLocked();
          const decryptBtn = document.getElementById("decryptBtn");
          if (decryptBtn) {
            decryptBtn.style.display = '';
            const btnTitle = decryptBtn.querySelector('.btnTitle');
            if (btnTitle) btnTitle.textContent = messages.btnDecryptText;
          }
          setSyncStatus(messages.gdriveLoadSuccessFile);
        } else {
          if (state.fileMode) exitFileMode(state);
          setResultText(content);
          setSyncStatus(messages.gdriveLoadSuccess);
        }
      }
    } catch (error) {
      const errMsg = (error as Error).message;
      if (errMsg.includes('canceled') || errMsg.includes('cancel')) {
        setSyncStatus('');
        return;
      }
      setErrMsg(errMsg.includes('Google authorization') ? messages.gdriveAuthFailed : `${messages.gdriveLoadFailed}: ${errMsg}`);
    }
  };
}

function showFilePicker(files: any[]): Promise<any> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#fff;border-radius:12px;padding:1.5rem;max-width:500px;width:90%;max-height:80vh;display:flex;flex-direction:column;';

    const title = document.createElement('h3');
    title.textContent = 'Select a backup file';
    title.style.cssText = 'margin:0 0 1rem;font-size:1rem;color:#333;';

    const select = document.createElement('select');
    select.style.cssText = 'width:100%;padding:0.5rem;font-size:0.875rem;border:1px solid #e3e6ea;border-radius:8px;margin-bottom:1rem;';

    files.forEach((f) => {
      const option = document.createElement('option');
      option.value = f.id;
      const date = new Date(f.modifiedTime);
      const dateStr = date.toLocaleString();
      const desc = f.description || '';
      let note = desc;
      try { const obj = JSON.parse(desc); if (obj.note) note = obj.note; } catch {}
      option.textContent = note ? `${note} (${dateStr})` : `${f.name} (${dateStr})`;
      select.appendChild(option);
    });

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:0.5rem 1rem;border:1px solid #e3e6ea;border-radius:8px;background:#fff;cursor:pointer;font-size:0.875rem;';
    cancelBtn.onclick = () => {
      overlay.remove();
      resolve(null);
    };

    const okBtn = document.createElement('button');
    okBtn.textContent = 'Load';
    okBtn.style.cssText = 'padding:0.5rem 1rem;border:none;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer;font-size:0.875rem;';
    okBtn.onclick = () => {
      const selectedId = select.value;
      const selectedFile = files.find((f) => f.id === selectedId);
      overlay.remove();
      resolve(selectedFile || null);
    };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);

    dialog.appendChild(title);
    dialog.appendChild(select);
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  });
}

// --- App ---

const App = (function () {

  async function init() {
    let ec = await ECC.initEC();
    const state = createAppState();

    bindCommonButtons(ec, state);
    bindFilePaste(ec, state);
    bindGoogleDriveSaveBtn(ec, state);
    bindGoogleDriveLoadBtn(ec, state);

    // 绑定眼睛按钮事件
    function bindEyeBtn() {
      const eyeBtn = document.getElementById('eyeBtn');
      const keyphrase = document.getElementById('keyphrase');
      if (eyeBtn && keyphrase) {
        const eyeOpen = eyeBtn.querySelector('.eye-open');
        const eyeClosed = eyeBtn.querySelector('.eye-closed');
        eyeBtn.addEventListener('click', function() {
          const isPassword = keyphrase.type === 'password';
          keyphrase.type = isPassword ? 'text' : 'password';
          if (eyeOpen) eyeOpen.style.display = isPassword ? 'none' : '';
          if (eyeClosed) eyeClosed.style.display = isPassword ? '' : 'none';
        });
      }
    }

    // 立即绑定眼睛按钮事件
    bindEyeBtn();

    let bookmarkOk = false;
    try {
      bookmarkOk = await initBookmark(ec, state);
    } catch (error) {
      console.error('Failed to init bookmark:', error);
    }

    if (!bookmarkOk) {
      setTimeout(() => { alert(messages.errNeedBookmark); location.href = 'index.html'; }, 2000);
      return;
    }

    const passphraseSection = document.getElementById('passphraseSection');
    if (passphraseSection && !state.G_Input?.private) {
      passphraseSection.style.display = 'block';
      setTimeout(applyComputePrivkeyBtnSquircle, 50);
    }

    await autoFetchHistory(ec, state);
    bindHistoryRefreshBtn(ec, state);

    // GDrive history - only show status, don't auto-fetch (requires manual refresh to authorize)
    bindGDriveHistoryRefreshBtn(ec, state);
    autoFetchGDriveHistory(ec, state);

    // 页面加载后自动获取最新密文
    if (state.G_Input?.pubkey && state.G_Input?.salt) {
      try {
        const content = await fetchLatestContent(ec, state.G_Input.pubkey, state.G_Input.salt);
        if (content) {
          if (content.startsWith('F.')) {
            enterFileModeUI(state, undefined, content);
            hideFileLocked();
            const decryptBtn = document.getElementById("decryptBtn");
            if (decryptBtn) {
              decryptBtn.style.display = '';
              const btnTitle = decryptBtn.querySelector('.btnTitle');
              if (btnTitle) btnTitle.textContent = messages.btnDecryptText;
            }
            setSyncStatus(messages.gdriveLoadSuccessFile);
          } else {
            if (state.fileMode) exitFileMode(state);
            setResultText(content);
          }
        }
      } catch (error) {
        console.warn('Failed to fetch latest:', error);
      }
    }

    showBuildInfo();
  }

  return { init };
})();
App.init();

initSquircle();
