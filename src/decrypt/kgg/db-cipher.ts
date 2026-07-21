/**
 * KGG 加密 SQLite 数据库解密器
 *
 * KGMusicV3.db 是 AES-128-CBC 加密的 SQLite 数据库。每 1024 字节页
 * 使用基于页号的派生密钥 + IV 加密：
 *
 *   pageKey(pageN) = MD5(masterKey || pageN_LE_4B || 0x546c4173_LE_4B)
 *   pageIv(pageN)  = MD5(LE_4B(PRNG(pageN + 1)) × 4)
 *
 * 移植自 OpenConverter (Apache 2.0) 的 src/decoders/kgg/db-cipher.js
 * 浏览器适配：node:crypto → crypto-js
 */

import CryptoJS from 'crypto-js';
import MD5 from 'crypto-js/md5';
import AES from 'crypto-js/aes';
import Hex from 'crypto-js/enc-hex';
import NoPadding from 'crypto-js/pad-nopadding';

const PAGE_SIZE = 1024;
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'ascii');

// KGMusicV3.db 的公开主密钥 (AES-128, KuGou 用来加密密钥数据库)
export const MASTER_KEY = Buffer.from([
  0x1d, 0x61, 0x31, 0x45, 0xb2, 0x47, 0xbf, 0x7f,
  0x3d, 0x18, 0x96, 0x72, 0x14, 0x4f, 0xe4, 0xbf,
]);

// 0x546c4173 ("sAlT" ASCII, LE) — 页密钥域分离
const PAGE_KEY_SALT = 0x546c4173;

// 页 IV PRNG 的 64 位 LCG 参数
const PRNG_MUL = 0x9ef4n;
const PRNG_DEC = 0xce26n;
const PRNG_MOD = 0x7fffff07n;
const MASK32 = 0xffffffffn;

function pageKey(masterKey: Buffer, pageNumber: number): Buffer {
  const material = Buffer.alloc(24);
  material.set(masterKey, 0);
  material.writeUInt32LE(pageNumber >>> 0, 16);
  material.writeUInt32LE(PAGE_KEY_SALT >>> 0, 20);
  const hash = MD5(Hex.parse(material.toString('hex')));
  return Buffer.from(hash.toString(Hex), 'hex');
}

function pageIv(pageNumber: number): Buffer {
  let seed = BigInt(pageNumber) + 1n;
  const material = Buffer.alloc(16);
  for (let i = 0; i < 4; i++) {
    const value = (seed * PRNG_MUL - (seed / PRNG_DEC) * PRNG_MOD) & MASK32;
    let next;
    if ((value & 0x80000000n) === 0n) {
      next = value;
    } else {
      next = (value + PRNG_MOD) & MASK32;
    }
    seed = next;
    material.writeUInt32LE(Number(next & MASK32), i * 4);
  }
  const hash = MD5(Hex.parse(material.toString('hex')));
  return Buffer.from(hash.toString(Hex), 'hex');
}

export function isPlaintextHeader(page: Buffer): boolean {
  return page.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER);
}

export function isEncryptedHeader(page: Buffer): boolean {
  const magic = page.readUInt32LE(20);
  if (magic !== 0x20204000) return false;
  const pageSizeLow = page[16] & 0xff;
  const pageSizeHigh = page[17] & 0xff;
  const pageSize = (pageSizeLow << 8) | (pageSizeHigh << 16);
  const diff = pageSize - 0x200;
  if (diff < 0 || diff > 0xfe00) return false;
  return ((pageSize - 1) & pageSize) === 0;
}

function decryptBlocks(ciphertext: Buffer, pageNumber: number, masterKey: Buffer): Buffer {
  const key = pageKey(masterKey, pageNumber);
  const iv = pageIv(pageNumber);
  const decrypted = AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext: Hex.parse(ciphertext.toString('hex')) }),
    Hex.parse(key.toString('hex')),
    { iv: Hex.parse(iv.toString('hex')), mode: CryptoJS.mode.CBC, padding: NoPadding },
  );
  return Buffer.from(decrypted.toString(Hex), 'hex');
}

export function decryptFirstPage(page: Buffer, masterKey: Buffer): void {
  if (!isEncryptedHeader(page)) {
    throw new Error('Invalid encrypted KGG database header');
  }
  const expectedHeader = Buffer.from(page.subarray(16, 24));
  page.copy(page, 16, 8, 16);
  const decrypted = decryptBlocks(page.subarray(16, PAGE_SIZE), 1, masterKey);
  decrypted.copy(page, 16);
  if (!page.subarray(16, 24).equals(expectedHeader)) {
    throw new Error('KGG database page 1 integrity check failed (wrong master key?)');
  }
  SQLITE_HEADER.copy(page, 0);
}

export function decryptPage(page: Buffer, pageNumber: number, masterKey: Buffer): void {
  decryptBlocks(page, pageNumber, masterKey).copy(page);
}

/**
 * 解密 KGMusicV3.db 的内存 Buffer。
 * 返回完整的已解密 SQLite 数据库 Buffer。
 */
export function decryptDatabaseBuffer(buffer: Buffer, masterKey: Buffer = MASTER_KEY): Buffer {
  const dec = Buffer.from(buffer);
  if (isPlaintextHeader(dec)) {
    return dec;
  }
  decryptFirstPage(dec.subarray(0, PAGE_SIZE), masterKey);
  for (let offset = PAGE_SIZE, pageNum = 2; offset < dec.length; offset += PAGE_SIZE, pageNum++) {
    const page = dec.subarray(offset, offset + PAGE_SIZE);
    if (page.length < PAGE_SIZE) break;
    decryptPage(page, pageNum, masterKey);
  }
  return dec;
}
