import { jsMessages as messages } from '@i18n/js-messages';
import { computePhash } from './common';

export function getPubkeyFolderName(pubkey: string): string {
  const safe = pubkey.replace(/[+/=]/g, m => m === '+' ? '-' : m === '/' ? '_' : '');
  return 'P-' + safe.slice(0, 13);
}

function sanitizeFileName(note: string): string {
  return note.replace(/[\/\\:*?"<>|]/g, '_').trim();
}

export interface GDriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  description?: string;
  appProperties?: Record<string, string>;
}

// 独立 OAuth 服务（msgbrd.vercel.app 转发到 vault10 Worker；refresh_token 只存在该服务端）
const GDRIVE_API_BASE = 'https://msgbrd.vercel.app';
const GDRIVE_WORKER_ORIGIN = 'https://vault10.kr7y.workers.dev';
const GDRIVE_SESSION_KEY = 'gdrive_api_session';
const GDRIVE_AUTH_STORAGE_KEY = 'gdrive_auth_message';
const GDRIVE_AUTH_CHANNEL = 'gdrive-auth';

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
  }

  async restoreSession(): Promise<boolean> {
    if (this.accessToken) return true;
    return this.tryRefresh();
  }

  async authorize(): Promise<void> {
    if (this.accessToken) return;
    if (await this.tryRefresh()) return;

    if (await this.detectBackend()) {
      await this.authorizeCodePopup();
      if (this.accessToken) return;
      if (await this.tryRefresh()) return;
      throw new Error('Google authorization failed');
    }

    const stored = localStorage.getItem('gdrive_access_token');
    if (stored) {
      this.accessToken = stored;
      return;
    }

    await this.authorizeImplicitPopup();
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
    const stored = localStorage.getItem('gdrive_access_token');
    if (stored) {
      this.accessToken = stored;
      return true;
    }
    return false;
  }

  signOut(): void {
    const headers = this.apiHeaders();
    this.accessToken = null;
    this.userEmail = null;
    localStorage.removeItem('gdrive_access_token');
    localStorage.removeItem(GDRIVE_SESSION_KEY);
    if (!this.apiBase) return;
    void fetch(`${this.apiBase}/api/gdrive/logout`, {
      method: 'POST',
      headers,
    }).catch(() => {});
  }

  private apiHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'X-Requested-With': 'XmlHttpRequest' };
    const session = localStorage.getItem(GDRIVE_SESSION_KEY);
    if (session) headers['X-GDrive-Session'] = session;
    return headers;
  }

  private rememberSession(data: any): void {
    if (data && typeof data.session === 'string' && data.session) {
      localStorage.setItem(GDRIVE_SESSION_KEY, data.session);
    }
    if (data && data.email) this.userEmail = data.email;
    if (data && (data.access_token || data.token)) {
      this.accessToken = data.access_token || data.token;
    }
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
      if (this.backendAvailable && data.email) this.userEmail = data.email;
      if (data && data.session) localStorage.setItem(GDRIVE_SESSION_KEY, data.session);
      return this.backendAvailable;
    } catch {
      this.backendAvailable = false;
      return false;
    }
  }

  private async tryRefresh(): Promise<boolean> {
    if (!(await this.detectBackend())) return false;
    if (!localStorage.getItem(GDRIVE_SESSION_KEY)) return false;
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

  private async authorizeCodePopup(): Promise<void> {
    const returnPage = new URL(this.callbackPath, location.href).href;
    const popupUrl = `${this.apiBase}/api/gdrive/authorize?return_origin=${encodeURIComponent(location.origin)}&return_url=${encodeURIComponent(returnPage)}`;
    await this.waitForAuthPopup(popupUrl, (data) => {
      this.rememberSession(data);
    }, this.authMessageOrigins());
  }

  private async authorizeImplicitPopup(): Promise<void> {
    await this.waitForAuthPopup(
      `${this.callbackPath}?client_id=${encodeURIComponent(this.clientId)}&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.file')}`,
      (data) => {
        this.accessToken = data.token;
        if (this.accessToken) localStorage.setItem('gdrive_access_token', this.accessToken);
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
      localStorage.removeItem('gdrive_access_token');
      throw new Error('Token expired, please sign in again');
    }

    if (response.status === 401) {
      this.accessToken = null;
      localStorage.removeItem('gdrive_access_token');
      throw new Error('Token expired, please sign in again');
    }

    return response;
  }

  async saveBackup(ec: any, plainText: string, ciphertext: string | Uint8Array, pubkey: string, salt: string, description: string): Promise<string> {
    await this.ensureAuthorized();

    const phash = await computePhash(ec, plainText, salt);

    let note = '';
    let ft = 'N';
    try {
      const descObj = JSON.parse(description);
      note = descObj.note || '';
      ft = descObj.ft || 'N';
    } catch {}
    const sanitized = sanitizeFileName(note);
    const fileName = sanitized ? `${sanitized}.ipgd` : `i-${phash}.ipgd`;

    const pubkeyFolderId = await this.ensurePubkeyFolder(pubkey);

    // Check if file with same phash already exists
    const existingFile = await this.findBackupByPhash(phash, pubkeyFolderId);

    const isBinary = ciphertext instanceof Uint8Array;
    const metadata = {
      name: fileName,
      mimeType: isBinary ? 'application/octet-stream' : 'text/plain',
      description,
      appProperties: { phash, fileType: ft },
      ...(existingFile ? {} : { parents: [pubkeyFolderId] }),
    };

    const fileId = existingFile ? existingFile.id : null;
    const uploadUrl = await this.startResumableUpload(fileId, metadata);
    const newFileId = await this.uploadContent(uploadUrl, ciphertext);
    return fileId || newFileId;
  }

  async listBackups(pubkey: string, salt: string, ec: any): Promise<GDriveFile[]> {
    await this.ensureAuthorized();
    const pubkeyFolderId = await this.ensurePubkeyFolder(pubkey);
    const query = `name contains '.ipgd' and trashed=false and '${pubkeyFolderId}' in parents`;

    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name,modifiedTime,description,appProperties)',
      orderBy: 'modifiedTime desc',
      pageSize: '50',
    });

    const response = await this.driveFetch(`/files?${params.toString()}`);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to list files: ${response.status} ${errText}`);
    }

    const data = await response.json();
    return data.files || [];
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
