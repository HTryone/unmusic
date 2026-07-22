import { AudioMimeType, GetArrayBuffer, SniffAudioExt } from '@/decrypt/utils';
import { DecryptResult } from '@/decrypt/entity';
import { extractQQMusicMeta } from '@/utils/qm_meta';

// =====================================================================
// QQ 音乐 QMC v2 纯本地解密（STag 头部 / QTag 尾部 / raw ekey）
// 移植自 OpenConverter (nowa277/OpenConverter, src/decoders/qmc.js, Apache 2.0)
// 全部用 Uint8Array + DataView 实现，不依赖 Node Buffer，可在 Worker 运行。
// musicex（无内嵌密钥）不在本模块处理范围，需外部提供 Cookie。
// =====================================================================

// ===== 基础工具 =====
function strAt(buf: Uint8Array, start: number, len: number): string {
  let s = '';
  const end = Math.min(start + len, buf.length);
  for (let i = start; i < end; i++) s += String.fromCharCode(buf[i] & 0xff);
  return s;
}
function asciiSlice(buf: Uint8Array, start: number, end: number): string {
  return strAt(buf, start, end - start);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function readUInt32LE(buf: Uint8Array, off: number): number {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}
function readUInt32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

// ===== 常量 =====
const V2_KEY_SIZE = 128;
const KEY_COMPRESS_INDEX_OFFSET = 71214;

const MIX_KEY_1 = Uint8Array.from([0x33, 0x38, 0x36, 0x5a, 0x4a, 0x59, 0x21, 0x40, 0x23, 0x2a, 0x24, 0x25, 0x5e, 0x26, 0x29, 0x28]);
const MIX_KEY_2 = Uint8Array.from([0x2a, 0x24, 0x25, 0x5e, 0x26, 0x29, 0x28, 0x23, 0x40, 0x21, 0x33, 0x38, 0x36, 0x5a, 0x4a, 0x59]);

const EXT_MAP_V2: Record<string, string> = {
  '.mflac0': 'flac', '.mflac': 'flac', '.mgg1': 'ogg', '.mgg': 'ogg',
  '.mflac2': 'flac', '.mflac4': 'flac', '.mgg2': 'ogg', '.mgg4': 'ogg', '.mggl': 'ogg',
  '.bkc': 'mp3', '.bkcmp3': 'mp3', '.bkcflac': 'flac', '.bkcogg': 'ogg',
  '.bkcm4a': 'm4a', '.bkcwav': 'wav', '.bkcwma': 'wma', '.bkcape': 'ape',
};

// ===== 掩码 / 密钥派生 =====
function shiftMix(byte: number, shift: number): number {
  shift &= 7;
  if (shift === 0) return byte;
  return ((byte << shift) | (byte >>> shift)) & 0xff;
}

function keyCompress(ekey: Uint8Array): Uint8Array {
  if (!ekey || ekey.length === 0) throw new Error('QMCv2: ekey is empty');
  const n = ekey.length;
  const out = new Uint8Array(V2_KEY_SIZE);
  for (let i = 0; i < V2_KEY_SIZE; i++) {
    const idx = (i * i + KEY_COMPRESS_INDEX_OFFSET) % n;
    const shift = (idx + 4) % 8;
    out[i] = shiftMix(ekey[idx], shift);
  }
  return out;
}

// ===== Tencent TEA =====
class TeaCipher {
  static delta = 0x9e3779b9;
  k0: number;
  k1: number;
  k2: number;
  k3: number;
  rounds: number;
  constructor(key: Uint8Array, rounds = 64) {
    if (key.length !== 16) throw new Error('incorrect key size');
    if ((rounds & 1) !== 0) throw new Error('odd number of rounds');
    this.k0 = readUInt32BE(key, 0);
    this.k1 = readUInt32BE(key, 4);
    this.k2 = readUInt32BE(key, 8);
    this.k3 = readUInt32BE(key, 12);
    this.rounds = rounds;
  }
  decryptBlock(dst: Uint8Array, dstOffset: number, src: Uint8Array, srcOffset: number): void {
    const sdv = new DataView(src.buffer, src.byteOffset + srcOffset, 8);
    let v0 = sdv.getUint32(0, false);
    let v1 = sdv.getUint32(4, false);
    let sum = (TeaCipher.delta * (this.rounds / 2)) >>> 0;
    for (let i = 0; i < this.rounds / 2; i++) {
      v1 = (v1 - (((v0 << 4) + this.k2) ^ (v0 + sum) ^ ((v0 >>> 5) + this.k3))) >>> 0;
      v0 = (v0 - (((v1 << 4) + this.k0) ^ (v1 + sum) ^ ((v1 >>> 5) + this.k1))) >>> 0;
      sum = (sum - TeaCipher.delta) >>> 0;
    }
    const ddv = new DataView(dst.buffer, dst.byteOffset + dstOffset, 8);
    ddv.setUint32(0, v0, false);
    ddv.setUint32(4, v1, false);
  }
}

function decryptTencentTea(inBuf: Uint8Array, key: Uint8Array): Uint8Array {
  if (inBuf.length % 8 !== 0) throw new Error('inBuf size not a multiple of the block size');
  if (inBuf.length < 16) throw new Error('inBuf size too small');
  const blk = new TeaCipher(key, 32);
  const tmpBuf = new Uint8Array(8);
  blk.decryptBlock(tmpBuf, 0, inBuf, 0);
  const nPadLen = tmpBuf[0] & 0x7;
  const SALT_LEN = 2;
  const ZERO_LEN = 7;
  const outLen = inBuf.length - 1 - nPadLen - SALT_LEN - ZERO_LEN;
  if (outLen < 0) throw new Error('invalid tea payload length');
  const outBuf = new Uint8Array(outLen);
  const ivPrev = new Uint8Array(8);
  const ivCur = inBuf.subarray(0, 8);
  let inBufPos = 8;
  let tmpIdx = 1 + nPadLen;
  const cryptBlock = () => {
    ivPrev.set(ivCur);
    ivCur.set(inBuf.subarray(inBufPos, inBufPos + 8));
    for (let j = 0; j < 8; j++) tmpBuf[j] ^= ivCur[j];
    blk.decryptBlock(tmpBuf, 0, tmpBuf, 0);
    inBufPos += 8;
    tmpIdx = 0;
  };
  for (let i = 1; i <= SALT_LEN; ) {
    if (tmpIdx < 8) { tmpIdx++; i++; } else { cryptBlock(); }
  }
  let outBufPos = 0;
  while (outBufPos < outLen) {
    if (tmpIdx < 8) {
      outBuf[outBufPos++] = tmpBuf[tmpIdx] ^ ivPrev[tmpIdx];
      tmpIdx++;
    } else {
      cryptBlock();
    }
  }
  for (let i = 1; i <= ZERO_LEN; i++) {
    if (tmpIdx >= 8) cryptBlock();
    if (tmpBuf[tmpIdx] !== ivPrev[tmpIdx]) throw new Error('zero check failed');
    tmpIdx++;
  }
  return outBuf;
}

function decryptV2Key(keyBuf: Uint8Array): Uint8Array {
  if (keyBuf.length >= 18 && asciiSlice(keyBuf, 0, 18) === 'QQMusic EncV2,Key:') {
    let out = decryptTencentTea(keyBuf.subarray(18), MIX_KEY_1);
    out = decryptTencentTea(out, MIX_KEY_2);
    const keyDec = base64ToBytes(asciiSlice(out, 0, out.length));
    if (keyDec.length < 16) throw new Error('EncV2 key decode failed');
    return keyDec;
  }
  return keyBuf;
}

function simpleMakeKey(salt: number, length: number): Uint8Array {
  const keyBuf = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const tmp = Math.tan(salt + i * 0.1);
    keyBuf[i] = (Math.abs(tmp) * 100.0) & 0xff;
  }
  return keyBuf;
}

function qmcDeriveKey(b64String: string): Uint8Array {
  let rawDec = base64ToBytes(b64String);
  if (rawDec.length < 16) return rawDec;
  const originalRawDec = rawDec;
  try {
    rawDec = decryptV2Key(rawDec);
    const simpleKey = simpleMakeKey(106, 8);
    const teaKey = new Uint8Array(16);
    for (let i = 0; i < 8; i++) {
      teaKey[i << 1] = simpleKey[i];
      teaKey[(i << 1) + 1] = rawDec[i];
    }
    const sub = decryptTencentTea(rawDec.subarray(8), teaKey);
    const finalKey = new Uint8Array(8 + sub.length);
    finalKey.set(rawDec.subarray(0, 8), 0);
    finalKey.set(sub, 8);
    return finalKey;
  } catch (e) {
    return originalRawDec;
  }
}

// ===== QMC 自定义 RC4 =====
class QmcRC4Cipher {
  key: Uint8Array;
  N: number;
  S: Uint8Array;
  hash: number;
  constructor(key: Uint8Array) {
    this.key = key;
    this.N = key.length;
    this.S = new Uint8Array(this.N);
    for (let i = 0; i < this.N; i++) this.S[i] = i & 0xff;
    let j = 0;
    for (let i = 0; i < this.N; i++) {
      j = (this.S[i] + j + this.key[i % this.N]) % this.N;
      const tmp = this.S[i]; this.S[i] = this.S[j]; this.S[j] = tmp;
    }
    this.hash = 1;
    for (let i = 0; i < this.N; i++) {
      const value = this.key[i];
      if (!value) continue;
      const next_hash = (this.hash * value) >>> 0;
      if (next_hash === 0 || next_hash <= this.hash) break;
      this.hash = next_hash;
    }
  }
  getSegmentKey(id: number): number {
    const seed = this.key[id % this.N];
    if (seed === 0) return 0;
    const idx = Math.floor((this.hash / ((id + 1) * seed)) * 100.0);
    return idx % this.N;
  }
  decrypt(buf: Uint8Array, offset: number): void {
    const SEGMENT_SIZE = 5120;
    let toProcess = buf.length;
    let processed = 0;
    const postProcess = (len: number) => {
      toProcess -= len; processed += len; offset += len;
      return toProcess === 0;
    };
    if (offset < 128) {
      const len = Math.min(buf.length, 128 - offset);
      for (let i = 0; i < len; i++) {
        buf[processed + i] ^= this.key[this.getSegmentKey(offset + i)];
      }
      if (postProcess(len)) return;
    }
    const encSegment = (subBuf: Uint8Array, off: number) => {
      const S = Uint8Array.from(this.S);
      const skipLen = (off % SEGMENT_SIZE) + this.getSegmentKey(Math.floor(off / SEGMENT_SIZE));
      let j = 0;
      let k = 0;
      for (let i = -skipLen; i < subBuf.length; i++) {
        j = (j + 1) % this.N;
        k = (S[j] + k) % this.N;
        const tmp = S[j]; S[j] = S[k]; S[k] = tmp;
        if (i >= 0) subBuf[i] ^= S[(S[j] + S[k]) % this.N];
      }
    };
    if (offset % SEGMENT_SIZE !== 0) {
      const len = Math.min(SEGMENT_SIZE - (offset % SEGMENT_SIZE), toProcess);
      encSegment(buf.subarray(processed, processed + len), offset);
      if (postProcess(len)) return;
    }
    while (toProcess > SEGMENT_SIZE) {
      encSegment(buf.subarray(processed, processed + SEGMENT_SIZE), offset);
      postProcess(SEGMENT_SIZE);
    }
    if (toProcess > 0) encSegment(buf.subarray(processed), offset);
  }
}

function getMapMask(derivedKey: Uint8Array): Uint8Array {
  const wkey = keyCompress(derivedKey);
  const mask = new Uint8Array(32768);
  for (let i = 0; i < 32768; i++) mask[i] = wkey[i % 128];
  return mask;
}

function applyMask(buf: Uint8Array, mask: Uint8Array): void {
  const len = buf.length;
  const limit1 = Math.min(len, 32768);
  for (let i = 0; i < limit1; i++) buf[i] ^= mask[i];
  for (let i = 32768; i < len; i++) buf[i] ^= mask[i % 32768];
}

export function decryptV2Buffer(qmcBuf: Uint8Array, ekeyB64: string): Uint8Array {
  if (!ekeyB64) throw new Error('QMCv2 requires an ekey string');
  const derivedKey = qmcDeriveKey(ekeyB64);
  const out = qmcBuf.slice();
  if (derivedKey.length > 300) {
    const rc4 = new QmcRC4Cipher(derivedKey);
    rc4.decrypt(out, 0);
  } else {
    const mask = getMapMask(derivedKey);
    applyMask(out, mask);
  }
  return out;
}

// ===== 密钥检测（STag 头部 / QTag 尾部 / raw ekey）=====
interface DetectResult {
  ekey?: string;
  audioLen: number;
}

function detectKey(buf: Uint8Array): DetectResult | null {
  const len = buf.length;
  // musicex：无内嵌密钥，需外部 Cookie，本模块不处理
  if (len >= 8 && asciiSlice(buf, len - 8, len) === 'musicex\x00') {
    throw new Error('该文件使用新版 QQ 音乐客户端加密 (musicex)，未内嵌密钥。请在设置页提供 QQ 音乐 Cookie。');
  }
  // STag 头部（新版 .mflac2/.mgg2/.mflac4/.mgg4）：ekey 在 0x18 起
  if (len >= 0x18 && asciiSlice(buf, 0, 4) === 'STag') {
    const ekeyLen = readUInt32LE(buf, 0x14);
    if (ekeyLen > 0 && ekeyLen < len - 0x18) {
      const ekeyBuf = buf.subarray(0x18, 0x18 + ekeyLen);
      return { ekey: asciiSlice(ekeyBuf, 0, ekeyBuf.length), audioLen: len - (0x18 + ekeyLen) };
    }
  }
  // QTag 尾部（旧版 .mflac/.mgg）：meta 逗号分隔，parts[1] 为 ekey
  const qTag = asciiSlice(buf, len - 4, len);
  if (qTag === 'QTag') {
    const metaLen = readUInt32LE(buf, len - 8);
    if (metaLen > 0 && metaLen < len - 8) {
      const rawMeta = asciiSlice(buf, len - 8 - metaLen, len - 8);
      const parts = rawMeta.split(',');
      if (parts.length > 1 && parts[1]) return { ekey: parts[1], audioLen: len - 8 - metaLen };
    }
  }
  // raw ekey（尾部 4 字节长度）
  if (len >= 4) {
    const rawLen = readUInt32LE(buf, len - 4);
    if (rawLen > 0 && rawLen < len - 4) {
      const rawMeta = asciiSlice(buf, len - 4 - rawLen, len - 4);
      return { ekey: rawMeta, audioLen: len - 4 - rawLen };
    }
  }
  return null;
}

// ===== 音频格式嗅探 =====
function detectAudioFormat(audio: Uint8Array): string | null {
  if (audio.length < 4) return null;
  if (audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33) return 'mp3';
  if (audio[0] === 0x66 && audio[1] === 0x4c && audio[2] === 0x61 && audio[3] === 0x43) return 'flac';
  if (audio[0] === 0x4f && audio[1] === 0x67 && audio[2] === 0x67 && audio[3] === 0x53) return 'ogg';
  if (audio[0] === 0x52 && audio[1] === 0x49 && audio[2] === 0x46 && audio[3] === 0x46) return 'wav';
  if (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0) return 'mp3';
  if (audio.length >= 8 && audio[4] === 0x66 && audio[5] === 0x74 && audio[6] === 0x79 && audio[7] === 0x70) return 'm4a';
  return null;
}

// ===== 导出解密入口 =====
export async function Decrypt(file: Blob, raw_filename: string, raw_ext: string): Promise<DecryptResult> {
  const ab = await GetArrayBuffer(file);
  const buf = new Uint8Array(ab);
  const detected = detectKey(buf);
  if (!detected || !detected.ekey) {
    throw new Error('无法从文件提取内嵌密钥（STag 无 ekey 或为 musicex），需提供 QQ 音乐 Cookie。');
  }
  const cipherText = buf.subarray(0, detected.audioLen);
  const audio = decryptV2Buffer(cipherText, detected.ekey);
  const hint = EXT_MAP_V2['.' + raw_ext] || 'mp3';
  const ext = SniffAudioExt(audio, hint) || detectAudioFormat(audio) || hint;
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
