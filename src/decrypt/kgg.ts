/**
 * KGG v5 解密入口 — 集成到 Unlock Music 解密路由
 *
 * 解密 .kgg / .kgg.flac 文件。
 * 需要从设置中导入 KGMusicV3.db 或 .kgg.key 文件以获取密钥。
 */

import { AudioMimeType, GetArrayBuffer, SniffAudioExt } from '@/decrypt/utils';
import { DecryptResult } from '@/decrypt/entity';
import { decrypt, memoryKeyProvider } from '@/decrypt/kgg/index';
import { loadKeysMap } from '@/utils/kgg-keys';

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

  return {
    title: raw_filename,
    ext: ext,
    mime: mime,
    file: URL.createObjectURL(blob),
    blob: blob,
    rawExt: raw_ext,
    rawFilename: raw_filename,
  };
}
