/**
 * 酷狗(KGG / 通用音频)元数据 + 封面写回。
 *
 * 与 QQ 的 qm_meta.ts 对称：内嵌封面优先，无则在线搜酷狗封面，并把封面写回
 * 输出音频文件 tag，使下载/导出的文件自带封面；同时返回 picture 供 UI 显示。
 *
 * 共享的底层工具（解析、写 tag）仍位于 @/decrypt/utils，本文件只承载酷狗专属逻辑。
 */

import { IAudioMetadata, parseBlob as metaParseBlob } from 'music-metadata-browser';
import {
  AudioMimeType,
  GetMetaFromFile,
  GetCoverFromFile,
  GetImageFromURL,
  WriteMetaToFlac,
  WriteMetaToMp3,
  IMusicMeta,
} from '@/decrypt/utils';
import { queryKugouCover, getKugouImageURL } from '@/utils/api';

/**
 * 封面补全并写回音频文件 tag。
 * 优先内嵌封面；内嵌无图则在线搜酷狗封面。若拿到封面且为 flac/mp3，写回输出文件，
 * 使下载/导出的文件自带封面；同时返回 picture 供 UI 显示。
 * 任意网络/解析异常均优雅降级（不写回、picture 为空），不影响解密主流程。
 */
export async function applyCoverAndWriteBack(
  audio: Uint8Array,
  ext: string,
  filename: string,
): Promise<{ blob: Blob; picture: string }> {
  const mime = AudioMimeType[ext] || 'audio/mpeg';
  let blob = new Blob([audio as BlobPart], { type: mime });

  const ori = await metaParseBlob(blob).catch(() => null);
  const info = GetMetaFromFile(
    filename,
    ori?.common?.title,
    String(ori?.common?.artists || ori?.common?.artist || ''),
  );
  const title = info.title || filename;
  const artist = info.artist || '';

  let coverBuffer: ArrayBuffer | undefined;
  let coverUrl = '';

  // 1) 内嵌封面优先
  const embedded = ori ? GetCoverFromFile(ori) : '';
  if (embedded) {
    coverUrl = embedded;
    try {
      const r = await fetch(embedded);
      coverBuffer = await r.arrayBuffer();
    } catch {
      coverBuffer = undefined;
    }
  }

  // 2) 内嵌无图 → 在线搜酷狗封面
  if (!coverBuffer) {
    try {
      const cov = await queryKugouCover(title, artist);
      if (cov?.Id) {
        const img = await GetImageFromURL(getKugouImageURL(cov.Id));
        if (img) {
          coverBuffer = img.buffer;
          coverUrl = img.url;
        }
      }
    } catch (e) {
      console.warn('kugou online cover failed', e);
    }
  }

  // 3) 写回文件 tag（仅 flac/mp3 且拿到封面时）
  if (coverBuffer && (ext === 'flac' || ext === 'mp3')) {
    const safeOri = (ori ?? { common: {}, native: {}, format: {} }) as IAudioMetadata;
    const newMeta: IMusicMeta = {
      title,
      artists: artist ? artist.split(/[,，\/]/).map((s) => s.trim()).filter(Boolean) : undefined,
      album: ori?.common?.album,
      picture: coverBuffer,
    };
    try {
      let out: Buffer | Uint8Array;
      if (ext === 'flac') out = WriteMetaToFlac(Buffer.from(audio), newMeta, safeOri);
      else out = WriteMetaToMp3(Buffer.from(audio), newMeta, safeOri);
      blob = new Blob([out as BlobPart], { type: mime });
    } catch (e) {
      console.warn('write cover to file failed', e);
    }
  }

  return { blob, picture: coverUrl };
}
