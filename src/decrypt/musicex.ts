import { AudioMimeType, GetArrayBuffer, SniffAudioExt } from '@/decrypt/utils';
import { DecryptResult } from '@/decrypt/entity';
import { extractQQMusicMeta } from '@/utils/qm_meta';
import { decryptV2Buffer } from './qmc_oj';
import { storage } from '@/utils/storage';

// =====================================================================
// QQ 音乐 musicex 解密（无内嵌密钥，需 VIP Cookie + 代理调 API 取 ekey）
// 移植自 OpenConverter (nowa277/OpenConverter, src/decoders/qmc.js, Apache 2.0)
// 解密复用 qmc_oj 的 decryptV2Buffer（与 STag/QTag 同一套 QMC v2 算法）。
// =====================================================================

// ===== 基础工具 =====
function readUInt32LE(buf: Uint8Array, off: number): number {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}

function asciiSlice(buf: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end && i < buf.length; i++) s += String.fromCharCode(buf[i] & 0xff);
  return s;
}

// utf16le 解码，遇到 null 字符终止（与 OpenConverter 的 .replace(/\0+$/,'') 等价）
function utf16leToString(buf: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i + 1 <= end; i += 2) {
    const code = buf[i] | (buf[i + 1] << 8);
    if (code === 0) break;
    s += String.fromCharCode(code);
  }
  return s;
}

// ===== musicex 尾部解析 =====
interface MusicexTail {
  songMid: string;
  fileMid: string;
  audioLen: number;
}

function parseMusicexTail(buf: Uint8Array): MusicexTail | null {
  const len = buf.length;
  if (len < 8) return null;
  // 文件末尾 8 字节为 "musicex\0"
  if (asciiSlice(buf, len - 8, len) !== 'musicex\x00') return null;
  if (len < 16) return null;
  const tailSize = readUInt32LE(buf, len - 16);
  if (tailSize <= 0 || tailSize >= len - 16) return null;
  const tail = buf.slice(len - 16 - tailSize, len - 16);
  if (tail.length < 184) return null;
  const songMid = utf16leToString(tail, 28, 88);
  const filename = utf16leToString(tail, 88, 184);
  const fileMid = filename.replace('.mflac', '').replace('.mgg', '');
  return { songMid, fileMid, audioLen: len - 16 - tailSize };
}

// ===== 从 Cookie 提取 uin / guid =====
function parseCookieFields(cookie: string): { uin: string; guid: string } {
  const map: Record<string, string> = {};
  for (const part of cookie.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) map[k] = v;
  }
  let uin = map['qqmusic_uin'] || map['uin'] || '';
  uin = uin.replace(/^o/, ''); // 去除 Tencent uin 可能的前导 'o'
  const guid = map['qqmusic_guid'] || map['guid'] || '';
  return { uin, guid };
}

// ===== 调 vkey.GetVkeyServer 取 ekey =====
async function fetchEkey(
  songMid: string,
  fileMid: string,
  cookie: string,
  proxyBase: string,
  settingsUin: string,
): Promise<string> {
  const cookieFields = parseCookieFields(cookie);
  // Cookie 可能不含 uin（如 QQ Connect 登录），回退到设置页手动填写的 QQ 号
  const uin = (cookieFields.uin || settingsUin).replace(/^o/, '');
  const guid = cookieFields.guid;
  const ext = fileMid.startsWith('F0') ? '.mflac' : '.mgg';
  const requestData = {
    comm: {
      cv: 4747474,
      ct: 24,
      format: 'json',
      inCharset: 'utf-8',
      outCharset: 'utf-8',
      notice: 0,
      platform: 'yqq.json',
      needNewCode: 1,
      uin,
      g_tk_new_20200303: 5381,
      g_tk: 5381,
    },
    req_1: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        filename: [`${fileMid}${ext}`],
        guid,
        songmid: [songMid],
        songtype: [0],
        uin,
        loginflag: 1,
        platform: '20',
      },
    },
  };

  const url = proxyBase.replace(/\/+$/, '') + '/cgi-bin/musicu.fcg';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'QQMusic/21',
      // 浏览器禁止 JS 设置 Cookie 请求头，改用自定义头，由代理/Worker 转成真实 Cookie
      'X-QQ-Cookie': cookie,
    },
    body: JSON.stringify(requestData),
  });

  if (!res.ok) {
    throw new Error(`vkey API 请求失败：HTTP ${res.status}（Cookie 可能过期或代理不可用）`);
  }
  const result = await res.json();
  const midurlinfo = result?.req_1?.data?.midurlinfo;
  if (midurlinfo && midurlinfo.length > 0 && midurlinfo[0].ekey) {
    return midurlinfo[0].ekey as string;
  }
  // 把服务端返回的具体拒绝原因透出，便于排查
  const detail = result?.req_1?.data ?? result;
  throw new Error(`vkey API 未返回 ekey：${JSON.stringify(detail)}`);
}

// ===== 导出解密入口 =====
export async function Decrypt(file: Blob, raw_filename: string, raw_ext: string): Promise<DecryptResult> {
  const ab = await GetArrayBuffer(file);
  const buf = new Uint8Array(ab);

  const tail = parseMusicexTail(buf);
  if (!tail) {
    throw new Error('不是有效的 musicex 文件（缺少 musicex 尾部标记）');
  }

  const cookie = (await storage.loadQQCookie()).trim();
  if (!cookie) {
    throw new Error('未设置 QQ 音乐 Cookie，请在设置页粘贴 VIP 账号的 Cookie 后重试');
  }

  const proxyBase = (await storage.loadQQProxy()).trim() || '/qq-api';
  const settingsUin = (await storage.loadQQUin()).trim();
  const ekey = await fetchEkey(tail.songMid, tail.fileMid, cookie, proxyBase, settingsUin);

  const cipherText = buf.slice(0, tail.audioLen);
  const audio = decryptV2Buffer(cipherText, ekey);

  const hint = tail.fileMid.startsWith('F0') ? 'flac' : 'ogg';
  const ext = SniffAudioExt(audio, hint) || hint;
  const mime = AudioMimeType[ext];
  const { album, artist, imgUrl, blob, title } = await extractQQMusicMeta(
    new Blob([audio as BlobPart], { type: mime }),
    raw_filename,
    ext,
    undefined,
  );

  return {
    title: title,
    artist: artist,
    ext: ext,
    album: album,
    picture: imgUrl,
    file: URL.createObjectURL(blob),
    blob: blob,
    mime: mime,
  };
}
