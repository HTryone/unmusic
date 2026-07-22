#!/usr/bin/env node
// 调试工具：解析解密后 FLAC 文件的 Vorbis Comment 原始字节，
// 逐字段对比「UTF-8 解码」与「GBK 解码」，实测元数据到底是什么编码。
// 用法：node source/scripts/analyze_vorbis.cjs <解密后的.flac>
const fs = require('fs');
const iconv = require('iconv-lite');

function findVorbisComment(buf) {
  if (buf.toString('ascii', 0, 4) !== 'fLaC') {
    throw new Error('不是 FLAC 文件（magic 不符）：' + buf.toString('ascii', 0, 4));
  }
  let off = 4;
  while (off < buf.length) {
    const lastBlock = (buf[off] & 0x80) !== 0;
    const blockType = buf[off] & 0x7f;
    const blockLen = (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3];
    off += 4;
    if (blockType === 4) return buf.slice(off, off + blockLen); // VORBIS_COMMENT
    off += blockLen;
    if (lastBlock) break;
  }
  throw new Error('未找到 VORBIS_COMMENT block');
}

function parseVorbisComment(vc) {
  let off = 0;
  const vendorLen = vc.readUInt32LE(off); off += 4;
  off += vendorLen; // 跳过 vendor
  const listLen = vc.readUInt32LE(off); off += 4;
  const comments = [];
  for (let i = 0; i < listLen; i++) {
    const clen = vc.readUInt32LE(off); off += 4;
    comments.push(vc.slice(off, off + clen));
    off += clen;
  }
  return comments;
}

// 检测 UTF-8 误读 GBK 产生的异常字符（中文标签不该出现的 Unicode 区块）
function hasGarbled(utf8str) {
  for (const ch of utf8str) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x0400 && cp <= 0x04ff) return true; // 西里尔
    if (cp >= 0x0500 && cp <= 0x052f) return true; // 西里尔补充
    if (cp >= 0x1e00 && cp <= 0x1eff) return true; // 拉丁扩展附加
    if (cp >= 0x0300 && cp <= 0x036f) return true; // 组合用读音记号
    if (cp >= 0xe000 && cp <= 0xf8ff) return true; // 私用区
    if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) return true; // 控制字符
  }
  return false;
}

function analyzeField(raw) {
  let utf8, utf8bad = false;
  try { utf8 = iconv.decode(raw, 'utf-8'); } catch { utf8 = '(无效UTF-8)'; utf8bad = true; }
  let gbk;
  try { gbk = iconv.decode(raw, 'gbk'); } catch { gbk = '(无效GBK)'; }
  let verdict = 'UTF-8';
  if (utf8bad || hasGarbled(utf8)) verdict = 'GBK（原始字节非合法UTF-8 或 UTF-8解码含异常字符）';
  return { utf8, gbk, verdict, hex: raw.slice(0, 64).toString('hex') };
}

const filePath = process.argv[2];
if (!filePath) { console.error('用法: node source/scripts/analyze_vorbis.cjs <解密后的.flac>'); process.exit(1); }
const buf = fs.readFileSync(filePath);
console.log('文件:', filePath, '大小:', buf.length);
const vc = findVorbisComment(buf);
const comments = parseVorbisComment(vc);
console.log('Vorbis Comment 条数:', comments.length);
const want = ['TITLE', 'ARTIST', 'ALBUM', 'GENRE', 'ALBUMARTIST'];
for (const raw of comments) {
  const eq = raw.indexOf(0x3d); // '='
  if (eq < 0) continue;
  const key = raw.slice(0, eq).toString('ascii');
  if (!want.includes(key)) continue;
  const val = raw.slice(eq + 1);
  const a = analyzeField(val);
  console.log(`\n[${key}]  长度=${val.length}字节`);
  console.log('  hex  :', a.hex);
  console.log('  UTF8 :', JSON.stringify(a.utf8));
  console.log('  GBK  :', JSON.stringify(a.gbk));
  console.log('  判定 :', a.verdict);
}
