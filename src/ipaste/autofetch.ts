import { jsMessages as messages } from '@i18n/js-messages';
import {
  createAppState, setErrMsg, setPlainText, setSyncStatus,
  generateKey, bindCommonButtons, initBookmark, showBuildInfo, initSquircle,
} from './common';

const App = (function () {

  async function init() {
    let ec = await ECC.initEC();
    const state = createAppState();

    interface HistoryItem {
      timeString: string;
      note: string;
      expire: string | null;
    }

    async function fetchHistoryList(pubkey: string, salt: string): Promise<HistoryItem[]> {
      const key = encodeURIComponent(await generateKey(ec, pubkey, salt));
      const url = `https://ecd1data.kr7y.workers.dev/${key}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch history');
      const data = await response.json();
      return data.data || [];
    }

    async function fetchHistoryDetail(pubkey: string, salt: string, timeString: string): Promise<string> {
      const key = encodeURIComponent(await generateKey(ec, pubkey, salt));
      const url = `https://ecd1data.kr7y.workers.dev/${key}/${encodeURIComponent(timeString)}?fmt=json`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch detail');
      const data = await response.json();
      return data.content || '';
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

    function renderHistoryList(items: HistoryItem[]) {
      const container = document.getElementById('historyList');
      if (!container) return;

      if (!items.length) {
        container.innerHTML = `<div class="history-empty">${messages.loadEmpty}</div>`;
        return;
      }

      container.innerHTML = '';
      items.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
          <div class="history-item-time">${formatTime(item.timeString)}</div>
          <div class="history-item-note">${item.note || '(no note)'}</div>
        `;
        div.onclick = () => handleHistoryClick(item, div);
        container.appendChild(div);
      });
    }

    async function handleHistoryClick(item: HistoryItem, el: HTMLElement) {
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
        const content = await fetchHistoryDetail(state.G_Input.pubkey, state.G_Input.salt, item.timeString);
        if (content) {
          setPlainText(content);
          setSyncStatus(messages.loadSuccess);
        }
      } catch (error) {
        setErrMsg('Failed to load: ' + (error as Error).message);
      } finally {
        if (btnTitle) btnTitle.textContent = originalText;
        el.style.pointerEvents = '';
      }
    }

    // Bind common buttons (decrypt, encrypt, save, restore, copy)
    bindCommonButtons(ec, state);

    // Decode bookmark from hash and initialize
    await initBookmark(ec, state);

    // Auto-fetch history list
    if (state.G_Input?.pubkey && state.G_Input?.salt) {
      try {
        const historyItems = await fetchHistoryList(state.G_Input.pubkey, state.G_Input.salt);
        renderHistoryList(historyItems);
      } catch (error) {
        console.error('Error fetching history:', error);
        const container = document.getElementById('historyList');
        if (container) container.innerHTML = `<div class="history-empty">Failed to load history</div>`;
      }
    }

    showBuildInfo();
  }

  return { init };
})();
App.init();

initSquircle();
