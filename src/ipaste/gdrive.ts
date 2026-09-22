import { jsMessages as messages } from '@i18n/js-messages';
import { computePhash, computeFilePhash } from './common';

export function getPubkeyFolderName(pubkey: string): string {
  const safe = pubkey.replace(/[+/=]/g, m => m === '+' ? '-' : m === '/' ? '_' : '');
  return 'P-' + safe.slice(0, 13);
}

function sanitizeFileName(note: string): string {
  return note.replace(/[\/\\:*?"<>|]/g, '_').trim();
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export const GDRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export function isGDriveFolder(file: { mimeType?: string }): boolean {
  return file.mimeType === GDRIVE_FOLDER_MIME;
}

export interface GDriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  mimeType?: string;
  description?: string;
  appProperties?: Record<string, string>;
}

// 独立 OAuth 服务（msgbrd.vercel.app 转发到 vault10 Worker；refresh_token 只存在该服务端）
const GDRIVE_API_BASE = 'https://msgbrd.vercel.app';
const GDRIVE_WORKER_ORIGIN = 'https://vault10.kr7y.workers.dev';
const GDRIVE_SESSION_KEY = 'gdrive_api_session';
const GDRIVE_EMAIL_KEY = 'gdrive_user_email';
const GDRIVE_TOKEN_KEY = 'gdrive_access_token';
const GDRIVE_ACCOUNTS_KEY = 'gdrive_accounts';
const GDRIVE_ACTIVE_KEY = 'gdrive_active_email';
const GDRIVE_AUTH_STORAGE_KEY = 'gdrive_auth_message';
const GDRIVE_AUTH_CHANNEL = 'gdrive-auth';

type GDriveAccountRecord = {
  session?: string;
  accessToken?: string;
};

type GDriveAccountsMap = Record<string, GDriveAccountRecord>;

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain) return '***';
  let maskedLocal: string;
  if (local.length <= 2) {
    maskedLocal = (local[0] || '*') + '***';
  } else {
    maskedLocal = local[0] + '***' + local[local.length - 1];
  }
  return maskedLocal + '@' + domain;
}

function normalizeApiBase(base: string): string {
  return base.replace(/\/+$/, '');
}

// --- GoogleDriveManager ---

export class GoogleDriveManager {
  private clientId: string;
  private accessToken: string | null = null;
  private callbackPath: string;
  private folderName: string;
  private apiBase: string;
  private apiOrigin: string | null = null;
  private backendAvailable: boolean | null = null;
  private userEmail: string | null = null;
  /** parentId + 目录名 → Drive folder id，批量保存时复用 */
  private childFolderIds = new Map<string, string>();

  constructor(clientId: string, callbackPath = './gdrive-callback.html', folderName = 'ipaste', apiBase = GDRIVE_API_BASE) {
    this.clientId = clientId;
    this.callbackPath = callbackPath;
    this.folderName = folderName;
    this.apiBase = normalizeApiBase(apiBase || '');
    try {
      this.apiOrigin = this.apiBase ? new URL(this.apiBase).origin : null;
    } catch {
      this.apiOrigin = null;
      this.apiBase = '';
    }
    this.migrateLegacyAccounts();
    const active = this.getActiveEmail();
    if (active) this.applyAccount(active);
  }

  getUserEmail(): string | null {
    return this.userEmail;
  }

  listAccounts(): string[] {
    return Object.keys(this.loadAccounts()).sort((a, b) => a.localeCompare(b));
  }

  getActiveEmail(): string | null {
    try {
      return localStorage.getItem(GDRIVE_ACTIVE_KEY) || localStorage.getItem(GDRIVE_EMAIL_KEY) || this.userEmail;
    } catch {
      return this.userEmail;
    }
  }

  /** 切换到已保存的账号；会刷新 token 并清空目录缓存。 */
  async switchAccount(email: string): Promise<void> {
    const accounts = this.loadAccounts();
    if (!accounts[email]) throw new Error('Account not found');
    this.persistActiveAccount();
    this.childFolderIds.clear();
    this.applyAccount(email);
    if (!(await this.tryRefresh()) && !this.accessToken) {
      // session 失效时仍保留账号记录，由调用方决定是否重新授权
      return;
    }
    if (this.accessToken && !this.userEmail) {
      await this.fetchUserEmail();
    }
  }

  /** 打开授权弹窗添加/切换到另一个 Google 账号（prompt=select_account）。 */
  async addAccount(): Promise<void> {
    this.persistActiveAccount();
    this.childFolderIds.clear();
    this.accessToken = null;
    // 暂时清掉当前 session 头，避免 status/refresh 绑回旧账号
    try { localStorage.removeItem(GDRIVE_SESSION_KEY); } catch { /* ignore */ }
    this.userEmail = null;
    if (await this.detectBackend()) {
      await this.authorizeCodePopup(true);
      if (!this.accessToken && !(await this.tryRefresh())) {
        throw new Error('Google authorization failed');
      }
    } else {
      await this.authorizeImplicitPopup(true);
    }
    if (this.accessToken && !this.userEmail) {
      await this.fetchUserEmail();
    }
    this.persistActiveAccount();
  }

  async restoreSession(): Promise<boolean> {
    if (!this.userEmail) {
      const active = this.getActiveEmail();
      if (active) this.applyAccount(active);
    }
    if (!this.accessToken) {
      if (await this.tryRefresh()) {
        // refreshed via backend session
      } else if (!this.backendAvailable) {
        const rec = this.activeRecord();
        if (rec?.accessToken) this.accessToken = rec.accessToken;
        else {
          const stored = localStorage.getItem(GDRIVE_TOKEN_KEY);
          if (stored) this.accessToken = stored;
        }
      }
    }
    if (!this.accessToken) return false;
    if (!this.userEmail) {
      await this.fetchUserEmail();
    }
    this.persistActiveAccount();
    return true;
  }

  async authorize(): Promise<void> {
    if (!this.accessToken) {
      if (await this.tryRefresh()) {
        // session restored
      } else if (await this.detectBackend()) {
        await this.authorizeCodePopup(false);
        if (!this.accessToken && !(await this.tryRefresh())) {
          throw new Error('Google authorization failed');
        }
      } else {
        const rec = this.activeRecord();
        if (rec?.accessToken) {
          this.accessToken = rec.accessToken;
        } else {
          const stored = localStorage.getItem(GDRIVE_TOKEN_KEY);
          if (stored) {
            this.accessToken = stored;
          } else {
            await this.authorizeImplicitPopup(false);
          }
        }
      }
    }
    if (this.accessToken && !this.userEmail) {
      await this.fetchUserEmail();
    }
    this.persistActiveAccount();
  }

  async ensureAuthorized(): Promise<void> {
    if (this.accessToken) return;
    await this.authorize();
  }

  isAuthorized(): boolean {
    if (this.accessToken !== null && this.accessToken !== '') {
      return true;
    }
    if (this.backendAvailable) return false;
    const rec = this.activeRecord();
    if (rec?.accessToken) {
      this.accessToken = rec.accessToken;
      return true;
    }
    const stored = localStorage.getItem(GDRIVE_TOKEN_KEY);
    if (stored) {
      this.accessToken = stored;
      return true;
    }
    return false;
  }

  /** 仅移除当前账号；若还有其它账号则切到其中一个。 */
  signOut(): void {
    const email = this.userEmail || this.getActiveEmail();
    if (email) this.removeAccount(email);
    else {
      const headers = this.apiHeaders();
      this.accessToken = null;
      this.userEmail = null;
      this.childFolderIds.clear();
      this.clearLegacyKeys();
      if (!this.apiBase) return;
      void fetch(`${this.apiBase}/api/gdrive/logout`, {
        method: 'POST',
        headers,
      }).catch(() => {});
    }
  }

  /** 从本地移除指定账号的 session/token；不影响其它账号。 */
  removeAccount(email: string): void {
    const accounts = this.loadAccounts();
    const rec = accounts[email];
    const headers: Record<string, string> = { 'X-Requested-With': 'XmlHttpRequest' };
    if (rec?.session) headers['X-GDrive-Session'] = rec.session;
    delete accounts[email];
    this.saveAccounts(accounts);
    this.childFolderIds.clear();

    const wasActive = (this.userEmail || this.getActiveEmail()) === email;
    if (wasActive) {
      this.accessToken = null;
      this.userEmail = null;
      const rest = Object.keys(accounts).sort((a, b) => a.localeCompare(b));
      if (rest.length) this.applyAccount(rest[0]);
      else this.clearLegacyKeys();
    }

    if (this.apiBase && rec?.session) {
      void fetch(`${this.apiBase}/api/gdrive/logout`, {
        method: 'POST',
        headers,
      }).catch(() => {});
    }
  }

  private loadAccounts(): GDriveAccountsMap {
    try {
      const raw = localStorage.getItem(GDRIVE_ACCOUNTS_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return obj && typeof obj === 'object' ? obj as GDriveAccountsMap : {};
    } catch {
      return {};
    }
  }

  private saveAccounts(accounts: GDriveAccountsMap): void {
    try {
      localStorage.setItem(GDRIVE_ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch { /* ignore */ }
  }

  private activeRecord(): GDriveAccountRecord | null {
    const email = this.userEmail || this.getActiveEmail();
    if (!email) return null;
    return this.loadAccounts()[email] || null;
  }

  private clearLegacyKeys(): void {
    try {
      localStorage.removeItem(GDRIVE_TOKEN_KEY);
      localStorage.removeItem(GDRIVE_SESSION_KEY);
      localStorage.removeItem(GDRIVE_EMAIL_KEY);
      localStorage.removeItem(GDRIVE_ACTIVE_KEY);
    } catch { /* ignore */ }
  }

  private migrateLegacyAccounts(): void {
    try {
      const accounts = this.loadAccounts();
      const email = localStorage.getItem(GDRIVE_EMAIL_KEY);
      const session = localStorage.getItem(GDRIVE_SESSION_KEY);
      const token = localStorage.getItem(GDRIVE_TOKEN_KEY);
      if (email && !accounts[email] && (session || token)) {
        accounts[email] = {
          ...(session ? { session } : {}),
          ...(token ? { accessToken: token } : {}),
        };
        this.saveAccounts(accounts);
      }
      if (email && !localStorage.getItem(GDRIVE_ACTIVE_KEY)) {
        localStorage.setItem(GDRIVE_ACTIVE_KEY, email);
      }
    } catch { /* ignore */ }
  }

  private applyAccount(email: string): void {
    const rec = this.loadAccounts()[email] || {};
    this.userEmail = email;
    this.accessToken = rec.accessToken || null;
    try {
      localStorage.setItem(GDRIVE_ACTIVE_KEY, email);
      localStorage.setItem(GDRIVE_EMAIL_KEY, email);
      if (rec.session) localStorage.setItem(GDRIVE_SESSION_KEY, rec.session);
      else localStorage.removeItem(GDRIVE_SESSION_KEY);
      if (rec.accessToken) localStorage.setItem(GDRIVE_TOKEN_KEY, rec.accessToken);
      else localStorage.removeItem(GDRIVE_TOKEN_KEY);
    } catch { /* ignore */ }
  }

  private persistActiveAccount(): void {
    const email = this.userEmail;
    if (!email) return;
    const accounts = this.loadAccounts();
    const prev = accounts[email] || {};
    const next: GDriveAccountRecord = { ...prev };
    try {
      const session = localStorage.getItem(GDRIVE_SESSION_KEY);
      if (session) next.session = session;
    } catch { /* ignore */ }
    if (this.accessToken) next.accessToken = this.accessToken;
    accounts[email] = next;
    this.saveAccounts(accounts);
    try {
      localStorage.setItem(GDRIVE_ACTIVE_KEY, email);
      localStorage.setItem(GDRIVE_EMAIL_KEY, email);
      if (next.session) localStorage.setItem(GDRIVE_SESSION_KEY, next.session);
      if (next.accessToken) localStorage.setItem(GDRIVE_TOKEN_KEY, next.accessToken);
    } catch { /* ignore */ }
  }

  private apiHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'X-Requested-With': 'XmlHttpRequest' };
    let session: string | null = null;
    try {
      const rec = this.activeRecord();
      session = rec?.session || localStorage.getItem(GDRIVE_SESSION_KEY);
    } catch {
      session = null;
    }
    if (session) headers['X-GDrive-Session'] = session;
    return headers;
  }

  private rememberSession(data: any): void {
    if (data && typeof data.session === 'string' && data.session) {
      try { localStorage.setItem(GDRIVE_SESSION_KEY, data.session); } catch { /* ignore */ }
    }
    if (data && typeof data.email === 'string' && data.email) {
      this.userEmail = data.email;
    }
    if (data && (data.access_token || data.token)) {
      this.accessToken = data.access_token || data.token;
    }
    this.persistActiveAccount();
  }

  private async detectBackend(): Promise<boolean> {
    if (!this.apiBase || !this.apiOrigin) {
      this.backendAvailable = false;
      return false;
    }
    if (this.backendAvailable !== null) return this.backendAvailable;
    try {
      const response = await fetch(`${this.apiBase}/api/gdrive/status`, {
        headers: this.apiHeaders(),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        this.backendAvailable = false;
        return false;
      }
      const data = await response.json();
      this.backendAvailable = !!(data && data.backend === true && data.configured !== false);
      if (this.backendAvailable) {
        this.rememberSession(data);
      }
      return this.backendAvailable;
    } catch {
      this.backendAvailable = false;
      return false;
    }
  }

  private async tryRefresh(): Promise<boolean> {
    if (!(await this.detectBackend())) return false;
    try {
      const response = await fetch(`${this.apiBase}/api/gdrive/refresh`, {
        method: 'POST',
        headers: this.apiHeaders(),
      });
      if (!response.ok) return false;
      const data = await response.json();
      if (!data.access_token) return false;
      this.rememberSession(data);
      return true;
    } catch {
      return false;
    }
  }

  async fetchUserEmail(): Promise<string | null> {
    if (this.userEmail) return this.userEmail;
    if (!this.accessToken) return null;
    try {
      const response = await this.driveFetch('/about?fields=user(emailAddress)');
      if (!response.ok) return null;
      const data = await response.json();
      const email = data?.user?.emailAddress;
      if (typeof email === 'string' && email) {
        this.rememberSession({ email });
      }
      return this.userEmail;
    } catch {
      return null;
    }
  }

  private authMessageOrigins(): string[] {
    const origins = new Set<string>([location.origin, GDRIVE_API_BASE, GDRIVE_WORKER_ORIGIN]);
    if (this.apiOrigin) origins.add(this.apiOrigin);
    return Array.from(origins);
  }

  private waitForAuthPopup(popupUrl: string, onSuccess: (data: any) => void, allowedOrigins?: string[] | null): Promise<void> {
    const origins = new Set(allowedOrigins && allowedOrigins.length ? allowedOrigins : [location.origin]);
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let channel: BroadcastChannel | null = null;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMessage);
        window.removeEventListener('storage', onStorage);
        try { channel?.close(); } catch { /* ignore */ }
        fn();
      };

      const accept = (data: any) => {
        if (!data || typeof data.type !== 'string') return;
        if (data.type === 'gdrive-auth-success') {
          finish(() => {
            onSuccess(data);
            resolve();
          });
        } else if (data.type === 'gdrive-auth-error') {
          finish(() => reject(new Error(data.error || 'Google authorization failed')));
        }
      };

      const onMessage = (event: MessageEvent) => {
        if (!origins.has(event.origin)) return;
        accept(event.data);
      };

      const onStorage = (event: StorageEvent) => {
        if (event.key !== GDRIVE_AUTH_STORAGE_KEY || !event.newValue) return;
        try { accept(JSON.parse(event.newValue)); } catch { /* ignore */ }
      };

      window.addEventListener('message', onMessage);
      window.addEventListener('storage', onStorage);
      try {
        channel = new BroadcastChannel(GDRIVE_AUTH_CHANNEL);
        channel.onmessage = (event) => { accept(event.data); };
      } catch { /* ignore */ }

      console.log('[gdrive] 打开新窗口', popupUrl);
      const popup = window.open(popupUrl, 'gdrive-auth', 'width=500,height=600,left=200,top=100');
      if (!popup) {
        finish(() => reject(new Error('Popup blocked. Please allow popups for this site.')));
        return;
      }

      setTimeout(() => {
        const checkClosed = setInterval(() => {
          if (!popup.closed) return;
          clearInterval(checkClosed);
          // Google COOP 可能让 closed 提前为 true；给本站回跳的 postMessage / storage 留时间
          setTimeout(() => {
            finish(() => reject(new Error('Authorization canceled')));
          }, 1500);
        }, 500);
      }, 2000);
    });
  }

  private async authorizeCodePopup(selectAccount = false): Promise<void> {
    const returnPage = new URL(this.callbackPath, location.href).href;
    let popupUrl = `${this.apiBase}/api/gdrive/authorize?return_origin=${encodeURIComponent(location.origin)}&return_url=${encodeURIComponent(returnPage)}`;
    if (selectAccount) popupUrl += '&prompt=select_account';
    await this.waitForAuthPopup(popupUrl, (data) => {
      this.rememberSession(data);
    }, this.authMessageOrigins());
  }

  private async authorizeImplicitPopup(selectAccount = false): Promise<void> {
    let popupUrl = `${this.callbackPath}?client_id=${encodeURIComponent(this.clientId)}&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.file')}`;
    if (selectAccount) popupUrl += '&prompt=select_account';
    await this.waitForAuthPopup(
      popupUrl,
      (data) => {
        this.accessToken = data.token;
        this.persistActiveAccount();
      }
    );
  }

  // --- Drive API ---

  private async driveFetch(endpoint: string, options: RequestInit = {}, didRefresh = false): Promise<Response> {
    if (!this.accessToken) {
      throw new Error('Not authorized');
    }

    const url = endpoint.startsWith('http') ? endpoint : `https://www.googleapis.com/drive/v3${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    if (response.status === 401 && !didRefresh) {
      this.accessToken = null;
      if (await this.tryRefresh()) {
        return this.driveFetch(endpoint, options, true);
      }
      localStorage.removeItem(GDRIVE_TOKEN_KEY);
      this.persistActiveAccount();
      throw new Error('Token expired, please sign in again');
    }

    if (response.status === 401) {
      this.accessToken = null;
      localStorage.removeItem(GDRIVE_TOKEN_KEY);
      this.persistActiveAccount();
      throw new Error('Token expired, please sign in again');
    }

    return response;
  }

  async saveBackup(ec: any, plainText: string, ciphertext: string | Uint8Array, pubkey: string, salt: string, description: string, contentPhash?: string): Promise<string> {
    await this.ensureAuthorized();

    const phash = contentPhash || await computePhash(ec, plainText, salt);

    let note = '';
    let ft = 'N';
    try {
      const descObj = JSON.parse(description);
      note = descObj.note || '';
      ft = descObj.ft || 'N';
    } catch {}
    const { parentId, fileName: locatedName } = await this.resolveSaveLocation(pubkey, note, ft, '');
    const fileName = locatedName || `i-${phash}.ipgd`;

    const existingFile = await this.findBackupByPhash(phash, parentId);
    // 文件内容 phash：已存在则跳过上传
    if (existingFile && contentPhash) {
      return existingFile.id;
    }

    const isBinary = ciphertext instanceof Uint8Array;
    const metadata = {
      name: fileName,
      mimeType: isBinary ? 'application/octet-stream' : 'text/plain',
      description,
      appProperties: { phash, fileType: ft },
      ...(existingFile ? {} : { parents: [parentId] }),
    };

    const fileId = existingFile ? existingFile.id : null;
    const uploadUrl = await this.startResumableUpload(fileId, metadata);
    const newFileId = await this.uploadContent(uploadUrl, ciphertext);
    return fileId || newFileId;
  }

  /** 超过 LARGE_FILE_THRESHOLD（8MB）：读一块、加密一块、立刻 PUT。Drive 要求非末块为 256KiB 对齐，客户端只多缓冲对齐余量。 */
  async saveBackupStream(
    ec: any,
    file: File,
    pubkey: string,
    salt: string,
    description: string,
    onProgress?: (uploaded: number, total: number) => void
  ): Promise<string> {
    const { createXPush, streamCipherTotalSize, STREAM_PLAIN_CHUNK } = await import('./stream-crypt');
    await this.ensureAuthorized();

    let note = '';
    let ft = 'X';
    try {
      const descObj = JSON.parse(description);
      note = descObj.note || '';
      ft = descObj.ft || 'X';
    } catch {}
    const phashNote = note || file.name;
    const realPhash = await computeFilePhash(ec, file, salt);
    const { parentId, fileName: locatedName } = await this.resolveSaveLocation(pubkey, phashNote, ft, file.name);
    const fileName = locatedName || `i-${realPhash}.ipgd`;
    const existingFile = await this.findBackupByPhash(realPhash, parentId);
    if (existingFile) {
      return existingFile.id;
    }
    const metadata = {
      name: fileName,
      mimeType: 'application/octet-stream',
      description,
      appProperties: { phash: realPhash, fileType: ft },
      parents: [parentId],
    };
    const fileId = null;
    const sessionUrl = await this.startResumableUpload(fileId, metadata);
    const total = streamCipherTotalSize(file.size);
    const { prefixAndEncHead, push } = await createXPush(ec, pubkey, salt);

    const ALIGN = 256 * 1024;
    let pending: Uint8Array[] = [];
    let pendingBytes = 0;
    let uploaded = 0;
    const MAX_RETRIES = 3;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    const concatTake = (n: number): Uint8Array => {
      const out = new Uint8Array(n);
      let off = 0;
      while (off < n) {
        const head = pending[0];
        const need = n - off;
        if (head.length <= need) {
          out.set(head, off);
          off += head.length;
          pending.shift();
          pendingBytes -= head.length;
        } else {
          out.set(head.subarray(0, need), off);
          pending[0] = head.subarray(need);
          pendingBytes -= need;
          off += need;
        }
      }
      return out;
    };

    const putBytes = async (chunk: Uint8Array, isLast: boolean) => {
      const start = uploaded;
      const end = uploaded + chunk.length - 1;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(chunk.length),
          'Content-Range': isLast ? `bytes ${start}-${end}/${total}` : `bytes ${start}-${end}/${total}`,
        };
        try {
          const response = await fetch(sessionUrl, { method: 'PUT', headers, body: chunk });
          if (response.ok || response.status === 308) {
            uploaded += chunk.length;
            onProgress?.(uploaded, total);
            if (response.ok) {
              const result = await response.json();
              return result.id as string;
            }
            return null;
          }
          if (attempt === MAX_RETRIES - 1) {
            const errText = await response.text();
            throw new Error(`Failed to upload chunk: ${response.status} ${errText}`);
          }
        } catch (e) {
          if (attempt === MAX_RETRIES - 1) throw e;
        }
        await sleep(1000 * (attempt + 1));
      }
      throw new Error('Upload chunk failed');
    };

    const enqueue = async (data: Uint8Array, isLast: boolean): Promise<string | null> => {
      pending.push(data);
      pendingBytes += data.length;
      let doneId: string | null = null;
      while (pendingBytes >= ALIGN && (!isLast || pendingBytes > ALIGN)) {
        const take = Math.floor(pendingBytes / ALIGN) * ALIGN;
        if (isLast && pendingBytes === take) break;
        if (take === 0) break;
        const send = concatTake(take);
        doneId = await putBytes(send, false);
      }
      if (isLast && pendingBytes > 0) {
        const send = concatTake(pendingBytes);
        doneId = await putBytes(send, true);
      }
      return doneId;
    };

    let resultId = await enqueue(prefixAndEncHead, false);
    let offset = 0;
    if (file.size === 0) {
      const cipher = push(new Uint8Array(0), true);
      resultId = await enqueue(cipher, true);
    } else {
      while (offset < file.size) {
        const end = Math.min(offset + STREAM_PLAIN_CHUNK, file.size);
        const buf = new Uint8Array(await file.slice(offset, end).arrayBuffer());
        const isFinal = end >= file.size;
        const cipher = push(buf, isFinal);
        // 非末块仅缓冲明文；末块 wasm 一次性加密后返回整段密文
        if (cipher.length > 0) {
          resultId = await enqueue(cipher, true);
        }
        offset = end;
      }
    }
    return fileId || resultId || '';
  }

  async savePlainFile(
    ec: any,
    file: File,
    pubkey: string,
    salt: string,
    driveName: string,
    smallFt: 'B' | 'F',
    onProgress?: (uploaded: number, total: number) => void
  ): Promise<string> {
    const { isLargeFile } = await import('./stream-crypt');
    if (isLargeFile(file)) {
      const desc = JSON.stringify({ note: driveName, ft: 'X' });
      return this.saveBackupStream(ec, file, pubkey, salt, desc, onProgress);
    }
    // 小文件：hash-wasm 算内容 phash，已存在则不加密不上传
    const phash = await computeFilePhash(ec, file, salt);
    const { parentId } = await this.resolveSaveLocation(pubkey, driveName, smallFt, file.name);
    const existing = await this.findBackupByPhash(phash, parentId);
    if (existing) return existing.id;

    const { encryptFileContent, encryptFileContentBinary } = await import('./common');
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    if (smallFt === 'B') {
      const ciphertext = await encryptFileContentBinary(ec, fileBytes, pubkey, salt);
      const desc = JSON.stringify({ note: driveName, ft: 'B' });
      return this.saveBackup(ec, driveName, ciphertext, pubkey, salt, desc, phash);
    }
    const ciphertext = await encryptFileContent(ec, fileBytes, pubkey, salt);
    const desc = JSON.stringify({ note: driveName, ft: 'F' });
    return this.saveBackup(ec, driveName, ciphertext, pubkey, salt, desc, phash);
  }

  async decryptXBackup(
    ec: any,
    fileId: string,
    privkey: string,
    pubkey: string,
    salt: string,
    filename: string,
    onProgress?: (done: number, total: number) => void
  ): Promise<void> {
    const {
      createXPull, X_HEAD_TOTAL, STREAM_PLAIN_CHUNK, STREAM_ABYTES, isXPrefix,
    } = await import('./stream-crypt');
    const { downloadBlob } = await import('./common');
    await this.ensureAuthorized();
    const response = await this.driveFetch(`/files/${fileId}?alt=media`);
    if (!response.ok || !response.body) {
      const errText = await response.text();
      throw new Error(`Failed to read file: ${response.status} ${errText}`);
    }
    const total = Number(response.headers.get('Content-Length') || '0');
    const reader = response.body.getReader();
    let leftover = new Uint8Array(0);
    let received = 0;

    const readExact = async (n: number): Promise<Uint8Array> => {
      while (leftover.length < n) {
        const { done, value } = await reader.read();
        if (done) {
          if (leftover.length === 0) throw new Error('Unexpected end of stream');
          break;
        }
        const next = new Uint8Array(leftover.length + value.length);
        next.set(leftover, 0);
        next.set(value, leftover.length);
        leftover = next;
        received += value.length;
        onProgress?.(received, total);
      }
      const take = Math.min(n, leftover.length);
      const out = leftover.subarray(0, take).slice();
      leftover = leftover.subarray(take);
      return out;
    };

    const prefixAndEncHead = await readExact(X_HEAD_TOTAL);
    if (prefixAndEncHead.length < X_HEAD_TOTAL || !isXPrefix(prefixAndEncHead)) {
      throw new Error('Invalid X. ciphertext');
    }
    const { update, final, pull } = await createXPull(ec, privkey, pubkey, salt, prefixAndEncHead);
    const bodyTotal = total > 0 ? Math.max(0, total - X_HEAD_TOTAL) : 0;
    let plain: Uint8Array;
    if (bodyTotal > 0) {
      const cipherLen = bodyTotal - STREAM_ABYTES;
      let cipherRead = 0;
      while (cipherRead < cipherLen) {
        const take = Math.min(STREAM_PLAIN_CHUNK, cipherLen - cipherRead);
        const cipher = await readExact(take);
        update(cipher);
        cipherRead += cipher.length;
      }
      const tag = await readExact(STREAM_ABYTES);
      plain = final(tag);
    } else {
      const bufParts: Uint8Array[] = leftover.length ? [leftover] : [];
      let bufLen = leftover.length;
      leftover = new Uint8Array(0);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bufParts.push(value);
        bufLen += value.length;
        received += value.length;
        onProgress?.(received, total);
      }
      const all = new Uint8Array(bufLen);
      { let o = 0; for (const p of bufParts) { all.set(p, o); o += p.length; } }
      if (all.length < STREAM_ABYTES) throw new Error('Unexpected end of stream');
      plain = pull(all, true).message;
    }

    try { reader.cancel(); } catch { /* ignore */ }
    downloadBlob(new Blob([plain], { type: 'application/octet-stream' }), filename);
  }

  async listChildren(folderId: string): Promise<GDriveFile[]> {
    await this.ensureAuthorized();
    const query = `'${folderId}' in parents and trashed=false and (mimeType='${GDRIVE_FOLDER_MIME}' or name contains '.ipgd')`;
    return this.listDriveFiles(query);
  }

  async listBackups(pubkey: string, salt: string, ec: any): Promise<GDriveFile[]> {
    await this.ensureAuthorized();
    const pubkeyFolderId = await this.ensurePubkeyFolder(pubkey);
    return this.listChildren(pubkeyFolderId);
  }

  async readBackup(fileId: string): Promise<string | Uint8Array> {
    await this.ensureAuthorized();

    const response = await this.driveFetch(`/files/${fileId}?alt=media`);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to read file: ${response.status} ${errText}`);
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    // Detect B. binary format: 0x42='B', 0x2E='.'
    if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x2E) {
      return buffer;
    }
    if (buffer.length >= 2 && buffer[0] === 0x58 && buffer[1] === 0x2E) {
      return buffer;
    }
    return new TextDecoder().decode(buffer).trim();
  }

  // --- Resumable Upload ---

  private async startResumableUpload(fileId: string | null, metadata: Record<string, any>): Promise<string> {
    const isUpdate = !!fileId;
    const url = isUpdate
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';

    const response = await this.driveFetch(url, {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to start upload: ${response.status} ${errText}`);
    }

    const sessionUrl = response.headers.get('Location');
    if (!sessionUrl) {
      throw new Error('No resumable upload session URL returned');
    }
    return sessionUrl;
  }

  private async uploadContent(sessionUrl: string, content: string | Uint8Array): Promise<string> {
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
    const data = content instanceof Uint8Array ? content : new TextEncoder().encode(content);
    const total = data.length;
    const MAX_RETRIES = 3;

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    const isRetryable = (status: number) => status === 0 || status >= 500;

    if (total <= CHUNK_SIZE) {
      // Small content: single PUT with retry
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(sessionUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Length': String(total),
            },
            body: data,
          });
          if (response.ok) {
            const result = await response.json();
            return result.id;
          }
          if (!isRetryable(response.status) || attempt === MAX_RETRIES - 1) {
            const errText = await response.text();
            throw new Error(`Failed to upload: ${response.status} ${errText}`);
          }
        } catch (e) {
          if (attempt === MAX_RETRIES - 1) throw e;
        }
        await sleep(1000 * (attempt + 1));
      }
    }

    // Chunked upload with retry per chunk
    let offset = 0;
    while (offset < total) {
      const end = Math.min(offset + CHUNK_SIZE, total) - 1;
      const chunk = data.slice(offset, end + 1);
      const chunkSize = chunk.length;
      const isLast = end + 1 >= total;

      let uploaded = false;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(chunkSize),
        };
        if (isLast) {
          headers['Content-Range'] = `bytes ${offset}-${end}/${total}`;
        } else {
          headers['Content-Range'] = `bytes ${offset}-${end}/*`;
        }

        try {
          const response = await fetch(sessionUrl, {
            method: 'PUT',
            headers,
            body: chunk,
          });

          if (response.ok) {
            const result = await response.json();
            return result.id;
          }

          if (response.status === 308) {
            // Server received chunk, move on
            uploaded = true;
            break;
          }

          if (!isRetryable(response.status) || attempt === MAX_RETRIES - 1) {
            const errText = await response.text();
            throw new Error(`Failed to upload chunk: ${response.status} ${errText}`);
          }
        } catch (e) {
          if (attempt === MAX_RETRIES - 1) throw e;
        }
        await sleep(1000 * (attempt + 1));
      }

      if (!uploaded) {
        throw new Error(`Chunk at offset ${offset} failed after ${MAX_RETRIES} retries`);
      }

      offset += CHUNK_SIZE;
    }

    throw new Error('Upload completed without server response');
  }

  // --- Helpers ---

  private async findLatestBackup(pubkey: string): Promise<GDriveFile | null> {
    return null;
  }

  private async listDriveFiles(query: string): Promise<GDriveFile[]> {
    const files: GDriveFile[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        q: query,
        fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,description,appProperties)',
        pageSize: '200',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const response = await this.driveFetch(`/files?${params.toString()}`);
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to list files: ${response.status} ${errText}`);
      }

      const data = await response.json();
      if (data.files?.length) files.push(...data.files);
      pageToken = data.nextPageToken || '';
    } while (pageToken);

    files.sort((a, b) => {
      const af = isGDriveFolder(a) ? 0 : 1;
      const bf = isGDriveFolder(b) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    });
    return files;
  }

  /** 按 note 中的相对路径建目录（如 data/a.txt → 创建 data/，文件 a.txt.ipgd）；无路径则放在公钥目录。 */
  private async resolveSaveLocation(pubkey: string, note: string, ft: string, fallbackName: string): Promise<{ parentId: string; fileName: string }> {
    const pubkeyFolderId = await this.ensurePubkeyFolder(pubkey);
    const norm = (note || fallbackName).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const parts = norm.split('/').filter(Boolean);
    const base = parts.pop() || fallbackName || 'file';
    let parentId = pubkeyFolderId;
    for (const seg of parts) {
      const name = sanitizeFileName(seg);
      if (!name) continue;
      parentId = await this.ensureChildFolder(parentId, name);
    }
    const sanitized = sanitizeFileName(base);
    return { parentId, fileName: sanitized ? `${sanitized}.ipgd` : '' };
  }

  private async ensureChildFolder(parentId: string, name: string): Promise<string> {
    const cacheKey = `${parentId}\0${name}`;
    const cached = this.childFolderIds.get(cacheKey);
    if (cached) return cached;

    const query = `name='${escapeDriveQuery(name)}' and mimeType='${GDRIVE_FOLDER_MIME}' and trashed=false and '${parentId}' in parents`;
    const response = await this.driveFetch(`/files?q=${encodeURIComponent(query)}&fields=files(id,name)`);
    if (!response.ok) throw new Error('Failed to find folder');
    const data = await response.json();
    if (data.files && data.files.length > 0) {
      const id = data.files[0].id as string;
      this.childFolderIds.set(cacheKey, id);
      return id;
    }

    const createResp = await this.driveFetch('/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: GDRIVE_FOLDER_MIME, parents: [parentId] }),
    });
    if (!createResp.ok) throw new Error('Failed to create folder');
    const folder = await createResp.json();
    this.childFolderIds.set(cacheKey, folder.id);
    return folder.id;
  }

  private async findBackupByPhash(phash: string, folderId: string): Promise<GDriveFile | null> {
    const query = `appProperties has { key='phash' and value='${phash}' } and trashed=false and '${folderId}' in parents`;
    const response = await this.driveFetch(`/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime,appProperties)`);
    if (!response.ok) return null;
    const data = await response.json();
    return (data.files && data.files.length > 0) ? data.files[0] : null;
  }

  private async ensurePubkeyFolder(pubkey: string): Promise<string> {
    const folderName = getPubkeyFolderName(pubkey);
    const ipasteFolderId = await this.ensureRootFolder();

    // Check if folder exists in ipaste root
    const response = await this.driveFetch(`/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${ipasteFolderId}' in parents&fields=files(id,name)`);
    if (!response.ok) throw new Error('Failed to find pubkey folder');
    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }

    // Create the folder
    const createResp = await this.driveFetch('/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [ipasteFolderId] }),
    });
    if (!createResp.ok) throw new Error('Failed to create pubkey folder');
    const folder = await createResp.json();
    return folder.id;
  }

  private async ensureRootFolder(): Promise<string> {
    const response = await this.driveFetch(`/files?q=name='${this.folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`);
    if (!response.ok) throw new Error(`Failed to find ${this.folderName} folder`);
    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    const createResp = await this.driveFetch('/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: this.folderName, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!createResp.ok) throw new Error(`Failed to create ${this.folderName} folder`);
    const folder = await createResp.json();
    return folder.id;
  }

  getStatusText(): string {
    if (this.isAuthorized()) {
      return 'Google Drive: Connected';
    }
    return 'Google Drive: Not connected';
  }
}
