import { jsMessages as messages } from '@i18n/js-messages';
import { computePhash } from './common';

export function getPubkeyFolderName(pubkey: string): string {
  const safe = pubkey.replace(/[+/=]/g, m => m === '+' ? '-' : m === '/' ? '_' : '');
  return 'P-' + safe.slice(0, 13);
}

export interface GDriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  description?: string;
}

// --- GoogleDriveManager ---

export class GoogleDriveManager {
  private clientId: string;
  private accessToken: string | null = null;
  private callbackPath: string;
  private folderName: string;

  constructor(clientId: string, callbackPath = './gdrive-callback.html', folderName = 'ipaste') {
    this.clientId = clientId;
    this.callbackPath = callbackPath;
    this.folderName = folderName;
  }

  // Auth: opens a popup to gdrive-callback.html which handles the OAuth flow.
  // The callback page uses postMessage to send the access_token back.
  async authorize(): Promise<void> {
    if (this.accessToken) return;

    // Try to restore token from localStorage
    const stored = localStorage.getItem('gdrive_access_token');
    if (stored) {
      this.accessToken = stored;
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const handler = (event: MessageEvent) => {
        if (event.data && event.data.type === 'gdrive-auth-success') {
          settled = true;
          this.accessToken = event.data.token;
          localStorage.setItem('gdrive_access_token', this.accessToken);
          resolve();
        }
      };

      window.addEventListener('message', handler);

      const callbackUrl = this.callbackPath;
      const popup = window.open(
        `${callbackUrl}?client_id=${encodeURIComponent(this.clientId)}&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.file')}`,
        'gdrive-auth',
        'width=500,height=600,left=200,top=100'
      );

      if (!popup) {
        window.removeEventListener('message', handler);
        reject(new Error('Popup blocked. Please allow popups for this site.'));
        return;
      }

      setTimeout(() => {
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handler);
            if (!settled) {
              reject(new Error('Authorization canceled'));
            }
          }
        }, 500);
      }, 2000);
    });
  }

  async ensureAuthorized(): Promise<void> {
    if (this.isAuthorized()) return;
    await this.authorize();
  }

  isAuthorized(): boolean {
    return this.accessToken !== null && this.accessToken !== '';
  }

  signOut(): void {
    this.accessToken = null;
  }

  // --- Drive API ---

  private async driveFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) {
      throw new Error('Not authorized');
    }

    const url = endpoint.startsWith('http') ? endpoint : `https://www.googleapis.com/drive/v3${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      this.accessToken = null;
      throw new Error('Token expired, please sign in again');
    }

    return response;
  }

  async saveBackup(ec: any, plainText: string, ciphertext: string, pubkey: string, salt: string, description: string): Promise<string> {
    await this.ensureAuthorized();

    const phash = await computePhash(ec, plainText, salt);
    const fileName = `i-${phash}.txt`;

    const pubkeyFolderId = await this.ensurePubkeyFolder(pubkey);

    // Check if file with same phash already exists
    const existingFile = await this.findBackupByPhash(phash, pubkeyFolderId);

    const metadata = {
      name: fileName,
      mimeType: 'text/plain',
      description,
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
    const query = `name contains 'i-' and trashed=false and '${pubkeyFolderId}' in parents`;

    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name,modifiedTime,description)',
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

  async readBackup(fileId: string): Promise<string> {
    await this.ensureAuthorized();

    const response = await this.driveFetch(`/files/${fileId}?alt=media`);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to read file: ${response.status} ${errText}`);
    }

    const text = await response.text();
    return text.trim();
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

  private async uploadContent(sessionUrl: string, content: string): Promise<string> {
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
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
            body: content,
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
    const fileName = `i-${phash}.txt`;
    const query = `name='${fileName}' and trashed=false and '${folderId}' in parents`;
    const response = await this.driveFetch(`/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)`);
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
