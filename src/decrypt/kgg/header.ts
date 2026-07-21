/**
 * KGG v5 文件头解析器
 *
 * 头部布局 (1024 字节前缀, little-endian):
 *   0x00..0x10  16 字节 magic
 *   0x10..0x14  uint32 headerLength
 *   0x14..0x18  uint32 cryptoVersion (3 或 5)
 *   ...         reserved
 *   0x44..0x48  uint32 idLength
 *   0x48..N     idLength 字节的 UTF-8 key id
 *   N..headerLength  reserved
 *   headerLength..end  加密音频数据
 *
 * 移植自 OpenConverter (Apache 2.0) 的 src/decoders/kgg/header.js
 */

export const MAGIC = Buffer.from([
  0x7c, 0xd5, 0x32, 0xeb, 0x86, 0x02, 0x7f, 0x4b,
  0xa8, 0xaf, 0xa6, 0x8e, 0x0f, 0xff, 0x99, 0x14,
]);

export const PREFIX_SIZE = 1024;
const ID_LENGTH_OFFSET = 0x44;
const ID_OFFSET = 0x48;
const MAX_ID_LENGTH = 256;

export interface KggHeader {
  headerLength: number;
  cryptoVersion: number;
  encryptionKeyId: string;
}

function readLeInt(buf: Buffer, offset: number): number {
  return (
    (buf[offset] & 0xff) |
    ((buf[offset + 1] & 0xff) << 8) |
    ((buf[offset + 2] & 0xff) << 16) |
    (((buf[offset + 3] & 0xff) << 24) >>> 0)
  );
}

export function parse(prefix: Buffer): KggHeader {
  if (prefix.length < ID_OFFSET) {
    throw new Error(`KGG header is truncated: ${prefix.length} < ${ID_OFFSET}`);
  }
  if (!prefix.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('KGG magic is invalid');
  }
  const headerLength = readLeInt(prefix, 0x10);
  if (headerLength < ID_OFFSET || headerLength > prefix.length) {
    throw new Error(`KGG header length is invalid: ${headerLength}`);
  }
  const version = readLeInt(prefix, 0x14);
  if (version !== 3 && version !== 5) {
    throw new Error(`Unsupported KGG crypto version: ${version}`);
  }
  const idLength = readLeInt(prefix, ID_LENGTH_OFFSET);
  if (idLength < 1 || idLength > MAX_ID_LENGTH) {
    throw new Error(`KGG key id length is invalid: ${idLength}`);
  }
  if (ID_OFFSET + idLength > headerLength) {
    throw new Error('KGG key id exceeds header length');
  }
  if (ID_OFFSET + idLength > prefix.length) {
    throw new Error('KGG key id is truncated');
  }
  const idBytes = prefix.subarray(ID_OFFSET, ID_OFFSET + idLength);
  const id = idBytes.toString('utf-8');
  if (id.includes('\uFFFD')) {
    throw new Error('KGG key id is not valid UTF-8');
  }
  if (id.trim().length === 0) {
    throw new Error('KGG key id is empty');
  }
  return { headerLength, cryptoVersion: version, encryptionKeyId: id };
}
