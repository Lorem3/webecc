export interface FolderFile {
  file: File;
  driveName: string;
  relPath: string;
}

const SKIP_NAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);

export function toDriveName(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

/** 把文件夹前缀与文件名拼成相对路径；folder 为空则原样返回 name。 */
export function joinDrivePath(folder: string, name: string): string {
  const f = (folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const n = (name || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!f) return n;
  if (!n) return f;
  return `${f}/${n}`;
}

export function pathBasename(p: string): string {
  const n = toDriveName(p);
  const i = n.lastIndexOf('/');
  return i >= 0 ? n.slice(i + 1) : n;
}

export type HistoryTreeNode = {
  name: string;
  isFolder: boolean;
  children: HistoryTreeNode[];
  file?: any;
  note?: string;
  dateStr?: string;
  isBackupFile?: boolean;
};

export function buildHistoryTree(
  items: { note: string; file: any; dateStr: string; isBackupFile: boolean }[]
): HistoryTreeNode[] {
  const root: HistoryTreeNode = { name: '', isFolder: true, children: [] };
  for (const item of items) {
    const parts = toDriveName(item.note || '').split('/').filter(Boolean);
    if (!parts.length) parts.push(item.file?.name || 'file');
    insertTreeNode(root, parts, item);
  }
  sortHistoryTree(root);
  return root.children;
}

function insertTreeNode(
  parent: HistoryTreeNode,
  parts: string[],
  item: { note: string; file: any; dateStr: string; isBackupFile: boolean }
): void {
  if (parts.length === 1) {
    parent.children.push({
      name: parts[0],
      isFolder: false,
      children: [],
      file: item.file,
      note: item.note,
      dateStr: item.dateStr,
      isBackupFile: item.isBackupFile,
    });
    return;
  }
  const head = parts[0];
  let folder = parent.children.find((c) => c.isFolder && c.name === head);
  if (!folder) {
    folder = { name: head, isFolder: true, children: [] };
    parent.children.push(folder);
  }
  insertTreeNode(folder, parts.slice(1), item);
}

function sortHistoryTree(node: HistoryTreeNode): void {
  node.children.sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortHistoryTree);
}

function shouldSkip(name: string): boolean {
  return SKIP_NAMES.has(name.toLowerCase()) || name.startsWith('._');
}

function entryToFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const acc: FileSystemEntry[] = [];
    const tick = () => {
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(acc);
          return;
        }
        acc.push(...batch);
        tick();
      }, reject);
    };
    tick();
  });
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: FolderFile[]): Promise<void> {
  if (shouldSkip(entry.name)) return;
  if (entry.isFile) {
    const file = await entryToFile(entry as FileSystemFileEntry);
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    out.push({ file, relPath, driveName: toDriveName(relPath) });
    return;
  }
  if (entry.isDirectory) {
    const dir = entry as FileSystemDirectoryEntry;
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    const children = await readAllEntries(dir.createReader());
    for (const child of children) {
      await walkEntry(child, nextPrefix, out);
    }
  }
}

export async function collectFromDataTransfer(dt: DataTransfer): Promise<{ kind: 'folder' | 'file'; files: FolderFile[] }> {
  const items = dt.items;
  const entries: FileSystemEntry[] = [];
  if (items && items.length) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
  }

  if (entries.length) {
    const hasDir = entries.some((e) => e.isDirectory);
    const out: FolderFile[] = [];
    for (const entry of entries) {
      await walkEntry(entry, '', out);
    }
    if (hasDir || out.length > 1) {
      return { kind: 'folder', files: out };
    }
    return { kind: 'file', files: out };
  }

  const list = dt.files;
  const files: FolderFile[] = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    if (shouldSkip(file.name)) continue;
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    files.push({ file, relPath: rel, driveName: toDriveName(rel) });
  }
  const folderish = files.some((f) => f.relPath.includes('/'));
  return { kind: folderish || files.length > 1 ? 'folder' : 'file', files };
}

export function collectFromFileList(list: FileList): FolderFile[] {
  const files: FolderFile[] = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    if (shouldSkip(file.name)) continue;
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    files.push({ file, relPath: rel, driveName: toDriveName(rel || file.name) });
  }
  return files;
}
