import { jsMessages as messages } from '@i18n/js-messages';
import {
  createAppState, bindCommonButtons, initBookmark, setErrMsg,
  setSyncStatus, setResultText, showBuildInfo, initSquircle,
} from './common';

// --- History ---

export interface HistoryItem {
  timeString: string;
  note: string;
  expire: string | null;
}

export async function fetchHistoryList(ec: any, pubkey: string, salt: string): Promise<HistoryItem[]> {
  const key = encodeURIComponent(await generateKey(ec, pubkey, salt));
  const url = `https://ecd1data.kr7y.workers.dev/${key}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch history');
  const data = await response.json();
  return data.data || [];
}

export async function fetchHistoryDetail(ec: any, pubkey: string, salt: string, timeString: string): Promise<string> {
  const key = encodeURIComponent(await generateKey(ec, pubkey, salt));
  const url = `https://ecd1data.kr7y.workers.dev/${key}/${encodeURIComponent(timeString)}?fmt=json`;
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
  const url = `https://ecd1data.kr7y.workers.dev/${key}/latest?fmt=json`;
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

// --- App ---

const App = (function () {

  async function init() {
    let ec = await ECC.initEC();
    const state = createAppState();

    bindCommonButtons(ec, state);

    try {
      await initBookmark(ec, state);
    } catch (error) {
      console.error('Failed to init bookmark:', error);
    }

    await autoFetchHistory(ec, state);
    bindHistoryRefreshBtn(ec, state);

    // 页面加载后自动获取最新密文
    if (state.G_Input?.pubkey && state.G_Input?.salt) {
      try {
        const content = await fetchLatestContent(ec, state.G_Input.pubkey, state.G_Input.salt);
        if (content) {
          setResultText(content);
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
