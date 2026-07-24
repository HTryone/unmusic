import { Decrypt as Mg3dDecrypt } from '@/decrypt/mg3d';
import { Decrypt as NcmDecrypt } from '@/decrypt/ncm';
import { Decrypt as NcmCacheDecrypt } from '@/decrypt/ncmcache';
import { Decrypt as XmDecrypt } from '@/decrypt/xm';
import { Decrypt as QmcDecrypt } from '@/decrypt/qmc';
import { Decrypt as QmcOjDecrypt } from '@/decrypt/qmc_oj';
import { Decrypt as MusicexDecrypt } from '@/decrypt/musicex';
import { Decrypt as QmcCacheDecrypt } from '@/decrypt/qmccache';
import { Decrypt as KgmDecrypt } from '@/decrypt/kgm';
import { Decrypt as KwmDecrypt } from '@/decrypt/kwm';
import { Decrypt as RawDecrypt } from '@/decrypt/raw';
import { Decrypt as TmDecrypt } from '@/decrypt/tm';
import { Decrypt as XimalayaDecrypt } from './ximalaya';
import { Decrypt as KggDecrypt } from './kgg';
import { DecryptResult, FileInfo } from '@/decrypt/entity';
import { SplitFilename } from '@/decrypt/utils';
import { storage } from '@/utils/storage';
import InMemoryStorage from '@/utils/storage/InMemoryStorage';

// musicex 格式常以 .mflac/.mgg 等扩展名出现（QQ 音乐下载即如此），
// 但内部无内嵌密钥、以文件尾部 8 字节 "musicex\0" 标记为特征。
// 优先按尾部标记路由，避免误走 QTag/WASM 路径导致解密出乱码。
async function isMusicexFile(raw: Blob | ArrayBuffer): Promise<boolean> {
  try {
    let tail: Uint8Array;
    if (typeof ArrayBuffer !== 'undefined' && raw instanceof ArrayBuffer) {
      tail = new Uint8Array(raw.slice(raw.byteLength - 8));
    } else {
      const blob = (raw as Blob).slice(-8);
      tail = new Uint8Array(await blob.arrayBuffer());
    }
    if (tail.length < 8) return false;
    const sig = [0x6d, 0x75, 0x73, 0x69, 0x63, 0x65, 0x78, 0x00]; // "musicex\0"
    return sig.every((b, i) => tail[i] === b);
  } catch {
    return false;
  }
}

export async function Decrypt(file: FileInfo, config: Record<string, any>): Promise<DecryptResult> {
  // Worker thread will fallback to in-memory storage.
  if (storage instanceof InMemoryStorage) {
    await storage.setAll(config);
  }

  const raw = SplitFilename(file.name);
  let rt_data: DecryptResult;

  // 先按尾部标记识别 musicex（无视扩展名），其余格式再走扩展名路由
  if (await isMusicexFile(file.raw)) {
    rt_data = await MusicexDecrypt(file.raw, raw.name, raw.ext);
  } else {
  switch (raw.ext) {
    case 'mg3d': // Migu Wav
      rt_data = await Mg3dDecrypt(file.raw, raw.name);
      break;
    case 'ncm': // Netease Mp3/Flac
      rt_data = await NcmDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'uc': // Netease Cache
      rt_data = await NcmCacheDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'kwm': // Kuwo Mp3/Flac
      rt_data = await KwmDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'xm': // Xiami Wav/M4a/Mp3/Flac
    case 'wav': // Xiami/Raw Wav
    case 'mp3': // Xiami/Raw Mp3
    case 'flac': // Xiami/Raw Flac
    case 'm4a': // Xiami/Raw M4a
      rt_data = await XmDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'ogg': // Raw Ogg
      rt_data = await RawDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'tm0': // QQ Music IOS Mp3
    case 'tm3': // QQ Music IOS Mp3
      rt_data = await RawDecrypt(file.raw, raw.name, 'mp3');
      break;
    case 'qmc0': //QQ Music Android Mp3
    case 'qmc3': //QQ Music Android Mp3
    case 'qmc2': //QQ Music Android Ogg
    case 'qmc4': //QQ Music Android Ogg
    case 'qmc6': //QQ Music Android Ogg
    case 'qmc8': //QQ Music Android Ogg
    case 'qmcflac': //QQ Music Android Flac
    case 'qmcogg': //QQ Music Android Ogg
    case 'tkm': //QQ Music Accompaniment M4a
    // Moo Music
    case 'bkcmp3':
    case 'bkcm4a':
    case 'bkcflac':
    case 'bkcwav':
    case 'bkcape':
    case 'bkcogg':
    case 'bkcwma':
    // QQ Music v2
    case 'mggl': //QQ Music Mac
    case 'mflac': //QQ Music New Flac
    case 'mflac0': //QQ Music New Flac
    case 'mflach': //QQ Music New Flac
    case 'mgg': //QQ Music New Ogg
    case 'mgg1': //QQ Music New Ogg
    case 'mgg0':
    case 'mmp4': // QMC MP4 Container w/ E-AC-3 JOC
    case '666c6163': //QQ Music Weiyun Flac
    case '6d7033': //QQ Music Weiyun Mp3
    case '6f6767': //QQ Music Weiyun Ogg
    case '6d3461': //QQ Music Weiyun M4a
    case '776176': //QQ Music Weiyun Wav
      rt_data = await QmcDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'mflac2': //QQ Music New Flac (STag 头部, 纯本地)
    case 'mgg2': //QQ Music New Ogg (STag 头部, 纯本地)
    case 'mflac4': //QQ Music New Flac (STag 头部, 纯本地)
    case 'mgg4': //QQ Music New Ogg (STag 头部, 纯本地)
      rt_data = await QmcOjDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'musicex': //QQ Music 无内嵌密钥格式 (需 VIP Cookie + 代理调 API 取 ekey)
      rt_data = await MusicexDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'tm2': // QQ Music IOS M4a
    case 'tm6': // QQ Music IOS M4a
      rt_data = await TmDecrypt(file.raw, raw.name);
      break;
    case 'cache': //QQ Music Cache
      rt_data = await QmcCacheDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'vpr':
    case 'kgm':
    case 'kgma':
      rt_data = await KgmDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'kgg':
    case 'kgg.flac':
      rt_data = await KggDecrypt(file.raw, raw.name, raw.ext);
      break;
    case 'x2m':
    case 'x3m':
      rt_data = await XimalayaDecrypt(file.raw, raw.name, raw.ext);
      break;
    default:
      throw '不支持此文件格式';
  }
  }

  if (!rt_data.rawExt) rt_data.rawExt = raw.ext;
  if (!rt_data.rawFilename) rt_data.rawFilename = raw.name;
  return rt_data;
}
