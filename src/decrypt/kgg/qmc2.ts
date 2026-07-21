/**
 * KGG QMC2 流密码
 *
 * 根据密钥长度选择两种实现：
 *   - MapCipher: 短密钥 (<=300 字节)，纯 XOR + 伪随机掩码
 *   - Rc4Cipher: 长密钥 (>300 字节)，RC4 流密码，5120 字节分段
 *
 * 移植自 OpenConverter (Apache 2.0) 的 src/decoders/kgg/qmc2.js
 */

const MAP_OFFSET_BOUNDARY = 0x7fffn;
const MAP_INDEX_OFFSET = 71214n;
const RC4_FIRST_SEGMENT_SIZE = 128n;
const RC4_SEGMENT_SIZE = 5120n;

export interface Qmc2Cipher {
  apply(buffer: Uint8Array, length: number, absoluteOffset: bigint): void;
}

function makeMapCipher(key: Uint8Array): Qmc2Cipher {
  const k = Buffer.from(key);
  return {
    apply(buffer: Uint8Array, length: number, absoluteOffset: bigint) {
      if (length < 0 || length > buffer.length) throw new Error('QMC2 buffer length is invalid');
      if (absoluteOffset < 0n) throw new Error('QMC2 offset is negative');
      const keyLen = BigInt(k.length);
      for (let i = 0; i < length; i++) {
        let offset = absoluteOffset + BigInt(i);
        if (offset > MAP_OFFSET_BOUNDARY) offset = offset % MAP_OFFSET_BOUNDARY;
        const keyIndex = Number((offset * offset + MAP_INDEX_OFFSET) % keyLen);
        const value = k[keyIndex] & 0xff;
        const shift = BigInt((keyIndex & 7) + 4) % 8n;
        const shifted = shift === 0n ? value : Number(((BigInt(value) << shift) | (BigInt(value) >> shift)) & 0xffn);
        buffer[i] = (buffer[i] ^ shifted) & 0xff;
      }
    },
  };
}

function makeRc4Cipher(key: Uint8Array): Qmc2Cipher {
  const k = Buffer.from(key);
  const box = new Uint8Array(k.length);
  for (let i = 0; i < k.length; i++) box[i] = i;

  // KSA
  let swapIndex = 0;
  for (let i = 0; i < k.length; i++) {
    swapIndex = (swapIndex + box[i] + (k[i] & 0xff)) % k.length;
    const t = box[i];
    box[i] = box[swapIndex];
    box[swapIndex] = t;
  }

  // Hash: 所有非零密钥字节相乘 mod 2^32
  let hash = 1n;
  for (const b of k) {
    const u = BigInt(b & 0xff);
    if (u === 0n) continue;
    const next = (hash * u) & 0xffffffffn;
    if (next === 0n || next <= hash) break;
    hash = next;
  }

  function segmentSkip(segmentId: bigint): number {
    const keyLen = BigInt(k.length);
    const seed = BigInt(k[Number(segmentId % keyLen)] & 0xff);
    if (seed === 0n) return 0;
    const numerator = hash;
    const denominator = (segmentId + 1n) * seed;
    const idx = BigInt(Math.floor((Number(numerator) / Number(denominator)) * 100));
    return Number(idx % keyLen);
  }

  function applySegment(buffer: Uint8Array, start: number, segLen: number, segOffset: bigint) {
    const state = new Uint8Array(box);
    let j = 0;
    let kIdx = 0;
    const skip = Number(segOffset % RC4_SEGMENT_SIZE) + segmentSkip(segOffset / RC4_SEGMENT_SIZE);
    for (let step = 0; step < skip + segLen; step++) {
      j = (j + 1) % state.length;
      kIdx = ((state[j] & 0xff) + kIdx) % state.length;
      const tmp = state[j];
      state[j] = state[kIdx];
      state[kIdx] = tmp;
      if (step >= skip) {
        const stream = state[((state[j] & 0xff) + (state[kIdx] & 0xff)) % state.length];
        buffer[start + step - skip] = buffer[start + step - skip] ^ stream;
      }
    }
  }

  return {
    apply(buffer: Uint8Array, length: number, absoluteOffset: bigint) {
      if (length < 0 || length > buffer.length) throw new Error('QMC2 buffer length is invalid');
      if (absoluteOffset < 0n) throw new Error('QMC2 offset is negative');
      let offset = absoluteOffset;
      let processed = 0;
      let remaining = length;

      // 前 128 字节段
      if (offset < RC4_FIRST_SEGMENT_SIZE) {
        const count = Number(BigInt(Math.min(remaining, Number(RC4_FIRST_SEGMENT_SIZE - offset))));
        for (let i = 0; i < count; i++) {
          const keyIndex = segmentSkip(offset + BigInt(i));
          buffer[processed + i] = buffer[processed + i] ^ k[keyIndex];
        }
        offset += BigInt(count);
        processed += count;
        remaining -= count;
      }

      // 对齐到 5120 边界
      if (remaining > 0 && offset % RC4_SEGMENT_SIZE !== 0n) {
        const toBoundary = Number(RC4_SEGMENT_SIZE - (offset % RC4_SEGMENT_SIZE));
        const count = Math.min(remaining, toBoundary);
        applySegment(buffer, processed, count, offset);
        offset += BigInt(count);
        processed += count;
        remaining -= count;
      }

      // 完整 5120 字节段
      while (remaining > Number(RC4_SEGMENT_SIZE)) {
        applySegment(buffer, processed, Number(RC4_SEGMENT_SIZE), offset);
        offset += RC4_SEGMENT_SIZE;
        processed += Number(RC4_SEGMENT_SIZE);
        remaining -= Number(RC4_SEGMENT_SIZE);
      }

      // 尾部部分段
      if (remaining > 0) {
        applySegment(buffer, processed, remaining, offset);
      }
    },
  };
}

export function makeCipher(key: Uint8Array): Qmc2Cipher {
  if (!key || key.length === 0) throw new Error('QMC2 key is empty');
  return key.length <= 300 ? makeMapCipher(key) : makeRc4Cipher(key);
}
