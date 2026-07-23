import { DecryptResult } from '@/decrypt/entity';
import { FileSystemDirectoryHandle } from '@/shims-fs';

export enum FilenamePolicy {
  ArtistAndTitle,
  TitleOnly,
  TitleAndArtist,
  SameAsOriginal,
}

export const FilenamePolicies: { key: FilenamePolicy; text: string }[] = [
  { key: FilenamePolicy.ArtistAndTitle, text: '歌手-歌曲名' },
  { key: FilenamePolicy.TitleOnly, text: '歌曲名' },
  { key: FilenamePolicy.TitleAndArtist, text: '歌曲名-歌手' },
  { key: FilenamePolicy.SameAsOriginal, text: '同源文件名' },
];

// 把元数据字段清洗成可用字符串：undefined/null/空串统一视为“缺失”
function cleanMeta(s?: string): string {
  if (!s) return '';
  const t = s.trim();
  return t === 'undefined' || t === 'null' ? '' : t;
}

// 取原文件名（去掉扩展名），用于“未识别到歌手时回退”
function rawBaseName(data: DecryptResult): string {
  const n = cleanMeta(data.rawFilename) || '未命名';
  const i = n.lastIndexOf('.');
  return i > 0 ? n.slice(0, i) : n;
}

export function GetDownloadFilename(data: DecryptResult, policy: FilenamePolicy): string {
  const artist = cleanMeta(data.artist);
  const title = cleanMeta(data.title);
  const raw = rawBaseName(data);
  switch (policy) {
    case FilenamePolicy.TitleOnly:
      return `${title || raw}.${data.ext}`;
    case FilenamePolicy.TitleAndArtist:
      // 无歌手时回退原文件名，避免 “歌名 - undefined”
      if (!artist) return `${raw}.${data.ext}`;
      return `${title || raw} - ${artist}.${data.ext}`;
    case FilenamePolicy.SameAsOriginal:
      return `${raw}.${data.ext}`;
    default:
    case FilenamePolicy.ArtistAndTitle:
      // 未识别到歌手时回退原文件名，避免出现 “undefined - 歌名”
      if (!artist) return `${raw}.${data.ext}`;
      return `${artist} - ${title || raw}.${data.ext}`;
  }
}

export async function DirectlyWriteFile(data: DecryptResult, policy: FilenamePolicy, dir: FileSystemDirectoryHandle) {
  let filename = GetDownloadFilename(data, policy);
  // prevent filename exist
  try {
    await dir.getFileHandle(filename);
    filename = `${new Date().getTime()} - ${filename}`;
  } catch (e) {}
  const file = await dir.getFileHandle(filename, { create: true });
  const w = await file.createWritable();
  await w.write(data.blob);
  await w.close();
}

export function DownloadBlobMusic(data: DecryptResult, policy: FilenamePolicy) {
  const a = document.createElement('a');
  a.href = data.file;
  a.download = GetDownloadFilename(data, policy);
  document.body.append(a);
  a.click();
  a.remove();
}

export function RemoveBlobMusic(data: DecryptResult) {
  URL.revokeObjectURL(data.file);
  if (data.picture?.startsWith('blob:')) {
    URL.revokeObjectURL(data.picture);
  }
}

export class DecryptQueue {
  private readonly pending: (() => Promise<void>)[];

  constructor() {
    this.pending = [];
  }

  queue(fn: () => Promise<void>) {
    this.pending.push(fn);
    this.consume();
  }

  private consume() {
    const fn = this.pending.shift();
    if (fn)
      fn()
        .then(() => this.consume)
        .catch(console.error);
  }
}
