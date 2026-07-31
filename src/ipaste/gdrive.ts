import { jsMessages as messages } from '@i18n/js-messages';
import { computePhash, generateKey } from './common';

export function pubkeyHash(ec: any, pubkey: string, salt: string): Promise<string> {
  return generateKey(ec, pubkey, salt).then(key => key.slice(0, 9));
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

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  // Auth: opens a popup to gdrive-callback.html which handles the OAuth flow.
  // The callback page uses postMessage to send the access_token back.
  async authorize(): Promise<void> {
    if (this.accessToken) return;

    // Try to restore token from sessionStorage
    const stored = sessionStorage.getItem('gdrive_access_token');
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
          sessionStorage.setItem('gdrive_access_token', this.accessToken);
          resolve();
        }
      };

      window.addEventListener('message', handler);

      const callbackUrl = './gdrive-callback.html';
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

    const pubkeyFolderId = await this.ensurePubkeyFolder(ec, pubkey, salt);

    // Check if file with same phash already exists
    const existingFile = await this.findBackupByPhash(phash, pubkeyFolderId);
    if (existingFile) {
      // Update existing file using multipart
      const boundary = '-------314159265358979323846';
      const bodyParts =
        `\r\n--${boundary}\r\n` +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify({ name: existingFile.name, mimeType: 'text/plain', description }) +
        `\r\n--${boundary}\r\n` +
        'Content-Type: text/plain\r\n\r\n' +
        ciphertext +
        `\r\n--${boundary}--`;

      const response = await this.driveFetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': `multipart/related; boundary="${boundary}"`,
          },
          body: bodyParts,
        }
      );
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to update: ${response.status} ${errText}`);
      }
      const result = await response.json();
      return result.id;
    }

    // Create file with content using multipart upload
    const boundary = '-------314159265358979323846';
    const metadataJson = JSON.stringify({
      name: fileName,
      mimeType: 'text/plain',
      description,
      parents: [pubkeyFolderId],
    });

    const multipartBody =
      `\r\n--${boundary}\r\n` +
      'Content-Type: application/json\r\n\r\n' +
      metadataJson +
      `\r\n--${boundary}\r\n` +
      'Content-Type: text/plain\r\n\r\n' +
      ciphertext +
      `\r\n--${boundary}--`;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`,
        },
        body: multipartBody,
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to save: ${response.status} ${errText}`);
    }

    const result = await response.json();
    return result.id;
  }

  async listBackups(pubkey: string, salt: string, ec: any): Promise<GDriveFile[]> {
    await this.ensureAuthorized();
    const pubkeyFolderId = await this.ensurePubkeyFolder(ec, pubkey, salt);
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

  private async ensurePubkeyFolder(ec: any, pubkey: string, salt: string): Promise<string> {
    const folderName = 'P' + await pubkeyHash(ec, pubkey, salt);
    const ipasteFolderId = await this.ensureIPasteFolder();

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

  private async ensureIPasteFolder(): Promise<string> {
    // Check if ipaste folder exists
    const response = await this.driveFetch(`/files?q=name='ipaste' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`);
    if (!response.ok) throw new Error('Failed to find ipaste folder');
    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    // Create the folder
    const createResp = await this.driveFetch('/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ipaste', mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!createResp.ok) throw new Error('Failed to create ipaste folder');
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
