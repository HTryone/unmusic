import { AudioMimeType, GetArrayBuffer, GetMetaFromFile, SniffAudioExt } from '@/decrypt/utils';
import { applyCoverAndWriteBack } from '@/utils/kugou_meta';

import { DecryptResult } from '@/decrypt/entity';

import { parseBlob as metaParseBlob } from 'music-metadata-browser';

export async function Decrypt(
  file: Blob,
  raw_filename: string,
  raw_ext: string,
  detect: boolean = true,
): Promise<DecryptResult> {
  let ext = raw_ext;
  let audio: Uint8Array;
  if (detect) {
    audio = new Uint8Array(await GetArrayBuffer(file));
    ext = SniffAudioExt(audio, raw_ext);
    if (ext !== raw_ext) file = new Blob([audio], { type: AudioMimeType[ext] });
  } else {
    audio = new Uint8Array(await GetArrayBuffer(file));
  }
  const tag = await metaParseBlob(file);
  const { title, artist } = GetMetaFromFile(raw_filename, tag.common.title, String(tag.common.artists || tag.common.artist || ''));

  // 封面：内嵌优先，无则在线搜酷狗，并写回输出文件 tag
  const { blob, picture } = await applyCoverAndWriteBack(audio, ext, raw_filename);

  return {
    title,
    artist,
    ext,
    album: tag.common.album,
    picture,
    file: URL.createObjectURL(blob),
    blob,
    mime: AudioMimeType[ext],
  };
}
