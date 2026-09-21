import { jsMessages as messages } from '@i18n/js-messages';
import {
  createAppState, bindCommonButtons, initBookmark, setErrMsg,
  setSyncStatus, setResultText, getResultText, getPlainText, encryptContent,
  showBuildInfo, initSquircle, applyComputePrivkeyBtnSquircle,
  hideFileLocked, bindFilePaste, showFileLocked, enterFileModeUI, exitFileMode,
  fireD1Init,
} from './common';
import { GoogleDriveManager, maskEmail } from './gdrive';
import { buildHistoryTree, pathBasename, HistoryTreeNode } from './folder';

// --- History ---

export interface HistoryItem {
  timeString: string;
  note: string;
  expire: string | null;
}

// --- D1 历史删除 ---

const D1_API_BASE = 'https://msgbrd.vercel.app';

async function deleteD1Record(key: string, timestr: string, secret: string): Promise<void> {
  const res = await fetch(`${D1_API_BASE}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, timestr, secret }),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
}

async function handleHistoryDelete(ec: any, state: any, item: HistoryItem, div: HTMLElement) {
  if (!state.G_Input?.pubkey || !state.G_Input?.salt) {
    setErrMsg(messages.errNeedBookmark);
    return;
  }
  const confirmDetail = `${formatTime(item.timeString)}${item.note ? '\n' + item.note : ''}`;
  let code = '';
  for (let i = 0; i < 4; i++) code += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const ans = prompt(`${messages.historyDeleteConfirm}\n\n${confirmDetail}\n\n${messages.historyDeleteCode}: ${code}`);
  if (ans === null) return;
  if (ans.trim().toUpperCase() !== code) {
    setErrMsg(messages.historyDeleteCodeMismatch);
    return;
  }

  const delBtn = div.querySelector(".history-item-del") as HTMLElement | null;
  if (delBtn) delBtn.style.pointerEvents = "none";
  try {
    const { key, secret } = await generateKeySecret(ec, state.G_Input.pubkey, state.G_Input.salt);
    await deleteD1Record(key, item.timeString, secret);
    div.remove();
    const container = document.getElementById("historyList");
    if (container && container.children.length === 0) {
      container.innerHTML = `<div class="history-empty">${messages.loadEmpty}</div>`;
    }
    setSyncStatus(messages.historyDeleteSuccess);
  } catch (error) {
    console.error("Error deleting history:", error);
    const msg = (error as Error).message;
    if (/not initialized/i.test(msg)) {
      setErrMsg(messages.historyDeleteNotInit);
    } else {
      setErrMsg(messages.historyDeleteFailed + ": " + msg);
    }
  } finally {
    if (delBtn) delBtn.style.pointerEvents = "";
  }
}

export async function fetchHistoryList(ec: any, pubkey: string, salt: string): Promise<HistoryItem[]> {
  const key = encodeURIComponent(await generateKey(ec, pubkey, salt));
  const url = `${D1_API_BASE}/${key}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch history');
  const data = await response.json();
  return data.data || [];
}

export async function fetchHistoryDetail(ec: any, pubkey: string, salt: string, timeString: string): Promise<string> {
  const key = encodeURIComponent(await generateKey(ec, pubkey, salt));
  const url = `${D1_API_BASE}/${key}/${encodeURIComponent(timeString)}?fmt=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch detail');
  const data = await response.json();
  return data.content || '';
}

async function generateKeySecret(ec: any, pubkey: string, salt: string): Promise<{ key: string; secret: string }> {
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
  const key = ec.base64Encode(new Uint8Array(keyBuffer).slice(0, 33), 1);
  const secBuffer = await crypto.subtle.sign("HMAC", keyKey, encoder.encode("cloudflare-d1-secret"));
  const secret = ec.base64Encode(new Uint8Array(secBuffer).slice(0, 33), 1);
  return { key, secret };
}

async function generateKey(ec: any, pubkey: string, salt: string): Promise<string> {
  return (await generateKeySecret(ec, pubkey, salt)).key;
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
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div class="history-item-time">${formatTime(item.timeString)}</div>
        <button class="history-item-del" type="button" title="${messages.historyDelete}" aria-label="${messages.historyDelete}">✕</button>
      </div>
      <div class="history-item-note">${item.note || '(no note)'}</div>
      ${expireStr ? `<div class="history-item-expire">过期: ${expireStr}</div>` : ''}
    `;
    div.onclick = () => handleHistoryClick(ec, state, item, div);
    const delBtn = div.querySelector('.history-item-del') as HTMLButtonElement;
    delBtn.onclick = (e) => {
      e.stopPropagation();
      handleHistoryDelete(ec, state, item, div);
    };
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
    if (historyItems.length > 0) {
      // 后台 init（不阻塞列表渲染），使该 key 后续可删除
      generateKeySecret(ec, state.G_Input.pubkey, state.G_Input.salt).then(({ key, secret }) => fireD1Init(key, secret));
    }
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
  const url = `${D1_API_BASE}/${key}/latest?fmt=json`;
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

function updateGDriveEmailUI(email: string | null) {
  const masked = email ? maskEmail(email) : '';
  document.querySelectorAll('.gdrive-email').forEach((el) => {
    el.textContent = masked;
    (el as HTMLElement).title = masked;
  });
}

function setGDriveLoading(on: boolean) {
  const bar = document.getElementById('gdriveProgress');
  if (bar) bar.style.display = on ? 'block' : 'none';
  document.getElementById('saveToGDrive')?.classList.toggle('disabled', on);
}

export async function autoFetchGDriveHistory(ec: any, state: any) {
  const container = document.getElementById('gdriveHistoryList');
  if (!container) return;

  const manager = getGDriveManager();
  updateGDriveEmailUI(manager.getUserEmail());

  try {
    setGDriveLoading(true);
    const restored = await manager.restoreSession();

    if (!restored && !manager.isAuthorized()) {
      updateGDriveEmailUI(null);
      container.innerHTML = `<div class="history-empty">${messages.gdriveStatusReady}</div>`;
      return;
    }

    if (!manager.getUserEmail()) {
      await manager.fetchUserEmail();
    }
    updateGDriveEmailUI(manager.getUserEmail());

    container.innerHTML = `<div class="history-loading">${messages.historyLoading}</div>`;
    const files = await manager.listBackups(state.G_Input.pubkey, state.G_Input.salt, ec);

    if (!files.length) {
      container.innerHTML = `<div class="history-empty">${messages.gdriveNoFiles}</div>`;
      return;
    }

    container.innerHTML = '';
    const treeItems = files.map((f) => {
      let note = f.description || f.name;
      try {
        const obj = JSON.parse(f.description || '');
        if (obj.note) note = obj.note;
      } catch {}
      const dateStr = new Date(f.modifiedTime).toLocaleString();
      const isBackupFile = f.description?.includes('"ft":"F"') || f.description?.includes('"ft":"B"') || f.description?.includes('"ft":"X"') || f.appProperties?.fileType === 'F' || f.appProperties?.fileType === 'B' || f.appProperties?.fileType === 'X';
      return { note, file: f, dateStr, isBackupFile };
    });
    const tree = buildHistoryTree(treeItems);
    tree.forEach((node) => container.appendChild(renderGDriveTreeNode(ec, state, node)));
  } catch (error) {
    console.error('Error fetching GDrive history:', error);
    const errMsg = (error as Error).message;
    // If token expired, clear it and show not connected status
    if (errMsg.includes('Token expired') || errMsg.includes('401')) {
      const manager = getGDriveManager();
      manager.signOut();
      localStorage.removeItem('gdrive_access_token');
      updateGDriveEmailUI(null);
      container.innerHTML = `<div class="history-empty">${messages.gdriveStatusReady}</div>`;
    } else {
      container.innerHTML = `<div class="history-empty">${messages.gdriveLoadFailed}</div>`;
    }
  } finally {
    setGDriveLoading(false);
  }
}

function renderGDriveTreeNode(ec: any, state: any, node: HistoryTreeNode): HTMLElement {
  if (node.isFolder) {
    const wrap = document.createElement('div');
    wrap.className = 'history-tree-wrap';
    const row = document.createElement('div');
    row.className = 'history-tree-folder';
    const chevron = document.createElement('span');
    chevron.className = 'history-tree-chevron';
    chevron.textContent = '▶';
    const nameEl = document.createElement('span');
    nameEl.className = 'history-tree-folder-name';
    nameEl.textContent = `📁 ${node.name}`;
    row.appendChild(chevron);
    row.appendChild(nameEl);
    const kids = document.createElement('div');
    kids.className = 'history-tree-children';
    node.children.forEach((child) => kids.appendChild(renderGDriveTreeNode(ec, state, child)));
    row.onclick = (e) => {
      e.stopPropagation();
      const open = kids.classList.toggle('open');
      chevron.textContent = open ? '▼' : '▶';
    };
    wrap.appendChild(row);
    wrap.appendChild(kids);
    return wrap;
  }

  const div = document.createElement('div');
  div.className = 'history-item';
  const timeEl = document.createElement('div');
  timeEl.className = 'history-item-time';
  timeEl.textContent = node.dateStr || '';
  const noteEl = document.createElement('div');
  noteEl.className = 'history-item-note';
  noteEl.textContent = node.name;
  div.appendChild(timeEl);
  div.appendChild(noteEl);
  if (node.isBackupFile) {
    const tag = document.createElement('div');
    tag.className = 'history-item-expire';
    tag.textContent = 'File';
    div.appendChild(tag);
  }
  div.onclick = () => handleGDriveHistoryClick(ec, state, node.file, div);
  return div;
}

async function handleGDriveHistoryClick(ec: any, state: any, file: any, el: HTMLElement) {
  document.querySelectorAll('#gdriveHistoryList .history-item').forEach(e => e.classList.remove('active'));
  el.classList.add('active');

  const btnTitle = el.querySelector('.history-item-note') as HTMLElement;
  const originalText = btnTitle?.textContent;
  if (btnTitle) btnTitle.textContent = 'Loading...';
  el.style.pointerEvents = 'none';

  setGDriveLoading(true);
  try {
    const manager = getGDriveManager();
    let ft = file.appProperties?.fileType || '';
    try {
      const obj = JSON.parse(file.description || '');
      if (obj.ft) ft = obj.ft;
    } catch {}

    if (ft === 'X') {
      let fileName = 'decrypted-file';
      try {
        const obj = JSON.parse(file.description || '');
        if (obj.note) fileName = pathBasename(obj.note);
      } catch {}
      enterFileModeUI(state, fileName, undefined, file.id);
      hideFileLocked();
      const decryptBtn = document.getElementById("decryptBtn");
      if (decryptBtn) {
        decryptBtn.style.display = '';
        const btnTitle = decryptBtn.querySelector('.btnTitle');
        if (btnTitle) btnTitle.textContent = messages.btnDecryptText;
      }
      setSyncStatus(messages.gdriveLoadSuccessFile);
      return;
    }

    const content = await manager.readBackup(file.id);
    if (content) {
      const isFileContent = (content instanceof Uint8Array) || (typeof content === 'string' && content.startsWith('F.'));
      if (isFileContent) {
        let fileName = 'decrypted-file';
        try {
          const obj = JSON.parse(file.description || '');
          if (obj.note) fileName = pathBasename(obj.note);
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
        setResultText(content as string);
        setSyncStatus(messages.gdriveLoadSuccess);
      }
    }
  } catch (error) {
    setErrMsg('Failed to load: ' + (error as Error).message);
  } finally {
    setGDriveLoading(false);
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
        updateGDriveEmailUI(manager.getUserEmail());
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
      setGDriveLoading(true);
      setSyncStatus(messages.gdriveLoading || 'Saving...');

      if (state.folderFiles?.length) {
        const list = state.folderFiles;
        let failed = 0;
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          setSyncStatus(`${messages.gdriveSavingFile} ${i + 1}/${list.length}: ${item.driveName}`);
          try {
            await manager.savePlainFile(ec, item.file, pubkey, salt, item.driveName, 'B', (up, tot) => {
              setSyncStatus(`${messages.gdriveSavingFile} ${i + 1}/${list.length}: ${item.driveName} (${Math.round(up / tot * 100)}%)`);
            });
          } catch (e) {
            console.error(e);
            failed++;
          }
        }
        autoFetchGDriveHistory(ec, state);
        if (failed) {
          setErrMsg(`${messages.gdriveFolderPartialFail}: ${failed}/${list.length}`);
        } else {
          setSyncStatus(messages.gdriveSaveSuccessFile);
        }
        exitFileMode(state);
      } else if (state.fileMode && state.fileData) {
        // === File mode ===
        const file = state.fileData;
        const descInput = (document.getElementById('gdriveDesc') as HTMLInputElement)?.value?.trim() || file.name;
        await manager.savePlainFile(ec, file, pubkey, salt, descInput, 'B');
        showFileLocked();
        setSyncStatus(messages.gdriveSaveSuccessFile);
        autoFetchGDriveHistory(ec, state);
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
        autoFetchGDriveHistory(ec, state);
      }
    } catch (error) {
      const errMsg = (error as Error).message;
      setErrMsg(errMsg.includes('Google authorization') ? messages.gdriveAuthFailed : `${messages.gdriveSaveFailed}: ${errMsg}`);
    } finally {
      setGDriveLoading(false);
    }
  };
}

// --- App ---

const App = (function () {

  async function init() {
    let ec = await ECC.initEC();
    const state = createAppState();
    state.decryptXFile = async (privkey, pubkey, salt, filename) => {
      if (!state.xFileId) throw new Error('No stream file');
      await getGDriveManager().decryptXBackup(ec, state.xFileId, privkey, pubkey, salt, filename);
    };

    bindCommonButtons(ec, state);
    bindFilePaste(ec, state);
    bindGoogleDriveSaveBtn(ec, state);

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

    bindGDriveHistoryRefreshBtn(ec, state);
    autoFetchGDriveHistory(ec, state);

    showBuildInfo();
  }

  return { init };
})();
App.init();

initSquircle();
