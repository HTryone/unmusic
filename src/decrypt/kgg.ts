/**
 * KGG v5 解密入口 — 集成到 Unlock Music 解密路由
 *
 * 解密 .kgg / .kgg.flac 文件。
 * 需要从设置中导入 KGMusicV3.db 或 .kgg.key 文件以获取密钥。
 */

import { AudioMimeType, GetArrayBuffer, GetCoverFromFile, GetMetaFromFile, SniffAudioExt } from '@/decrypt/utils';
import { parseBlob as metaParseBlob } from 'music-metadata-browser';
import { DecryptResult } from '@/decrypt/entity';
import { decrypt, memoryKeyProvider } from '@/decrypt/kgg/index';
import { loadKeysMap } from '@/utils/kgg-keys';
import { getKugouImageURL, queryKugouCover } from '@/utils/api';

export async function Decrypt(
  file: Blob,
  raw_filename: string,
  raw_ext: string,
): Promise<DecryptResult> {
  const fileBuffer = await GetArrayBuffer(file);
  const input = Buffer.from(fileBuffer);

  // 从 localStorage 加载已导入的密钥
  const keyMap = await loadKeysMap();
  if (keyMap.size === 0) {
    throw '未导入 KGG 密钥。请在设置中导入 KGMusicV3.db 或 .kgg.key 文件';
  }

  const { audio, format } = decrypt(input, memoryKeyProvider(keyMap));

  const ext = SniffAudioExt(audio, format);
  const mime = AudioMimeType[ext] || 'audio/mpeg';
  const blob = new Blob([audio as BlobPart], { type: mime });

  // 提取内嵌元数据(歌名/歌手/内嵌封面)。酷狗下载源通常不含内嵌封面,
  // 故内嵌为空时, 再按歌名/歌手经封面代理 Worker 去酷狗在线搜一张补全。
  const musicMeta = await metaParseBlob(blob);
  const { title, artist } = GetMetaFromFile(
    raw_filename,
    musicMeta.common.title || '',
    String(musicMeta.common.artists || musicMeta.common.artist || ''),
  );
  let picture = GetCoverFromFile(musicMeta);
  if (!picture) {
    try {
      const r = await queryKugouCover(title, artist, musicMeta.common.album || '');
      if (r.Id) picture = getKugouImageURL(r.Id);
    } catch (e) {
      console.warn('酷狗在线封面获取失败, 回退无封面', e);
    }
  }

  return {
    title,
    artist,
    album: musicMeta.common.album,
    ext: ext,
    mime: mime,
    file: URL.createObjectURL(blob),
    blob: blob,
    picture,
    rawExt: raw_ext,
    rawFilename: raw_filename,
  };
}
