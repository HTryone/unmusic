/**
 * KGG v5 解密入口 — 集成到 Unlock Music 解密路由
 *
 * 解密 .kgg / .kgg.flac 文件。
 * 需要从设置中导入 KGMusicV3.db 或 .kgg.key 文件以获取密钥。
 */

import { AudioMimeType, GetArrayBuffer, SniffAudioExt, applyCoverAndWriteBack } from '@/decrypt/utils';
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

  // 封面：内嵌优先，无则在线搜酷狗，并写回输出文件 tag（让下载的文件自带封面）
  const { blob, picture } = await applyCoverAndWriteBack(audio as Uint8Array, ext, raw_filename);

  return {
    title: raw_filename,
    ext: ext,
    mime: mime,
    file: URL.createObjectURL(blob),
    blob: blob,
    rawExt: raw_ext,
    rawFilename: raw_filename,
    picture: picture,
  };
}
