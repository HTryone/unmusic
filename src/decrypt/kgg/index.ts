/**
 * KGG v5 解密器 — Node/Electron 移植版本
 *
 * 端到端流程：读取 .kgg 文件 → 从文件头按 key id 查 ekey →
 * 解包 ekey 并构建 QMC2 流密码 → 解密音频字节 → 嗅探音频格式
 *
 * 纯函数，I/O 由调用方负责。
 *
 * 移植自 OpenConverter (Apache 2.0) 的 src/decoders/kgg/index.js
 */

import { parse, MAGIC, PREFIX_SIZE } from './header';
import { unwrap } from './ekey';
import { makeCipher, Qmc2Cipher } from './qmc2';

const PROBE_SIZE = 16;

export interface KggKeyProvider {
  find(id: string): string | null;
  count(): number;
}

export interface KggDecryptResult {
  audio: Buffer;
  format: string;
}

export function decrypt(input: Buffer, keyProvider: KggKeyProvider): KggDecryptResult {
  if (input.length < MAGIC.length || !input.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Not a valid KGG v5 file (invalid magic)');
  }
  const prefix = Buffer.from(input.subarray(0, PREFIX_SIZE));
  const hdr = parse(prefix);
  if (hdr.cryptoVersion !== 5) {
    throw new Error(`KGG crypto version ${hdr.cryptoVersion} belongs to the legacy decoder`);
  }

  const encoded = keyProvider.find(hdr.encryptionKeyId);
  if (!encoded) {
    const total = keyProvider.count();
    if (total === 0 || total === -1) {
      throw new Error('No KGG keys imported; import a kgg.key file or KGMusicV3.db in Settings');
    }
    throw new Error(`Missing KGG key for ${hdr.encryptionKeyId}`);
  }

  const v1Key = unwrap(encoded);
  const cipher: Qmc2Cipher = makeCipher(v1Key);

  const audioLen = input.length - hdr.headerLength;
  if (audioLen <= 0) throw new Error('KGG audio data is empty');

  const audio = Buffer.alloc(audioLen);
  input.copy(audio, 0, hdr.headerLength, input.length);
  cipher.apply(audio, audio.length, 0n);

  return { audio, format: sniffFormat(audio.subarray(0, Math.min(PROBE_SIZE, audioLen))) };
}

function sniffFormat(probe: Uint8Array): string {
  if (probe.length < 4) return 'mp3';
  if (probe[0] === 0x49 && probe[1] === 0x44 && probe[2] === 0x33) return 'mp3';
  if (probe[0] === 0x66 && probe[1] === 0x4c && probe[2] === 0x61 && probe[3] === 0x43) return 'flac';
  if (probe[0] === 0x4f && probe[1] === 0x67 && probe[2] === 0x67 && probe[3] === 0x53) return 'ogg';
  if (probe[0] === 0x52 && probe[1] === 0x49 && probe[2] === 0x46 && probe[3] === 0x46) return 'wav';
  if (probe[0] === 0xff && (probe[1] & 0xe0) === 0xe0) return 'mp3';
  if (probe.length >= 8 && probe[4] === 0x66 && probe[5] === 0x74 && probe[6] === 0x79 && probe[7] === 0x70) return 'm4a';
  return 'mp3';
}

// === 密钥映射解析 (kgg.key 文件格式: 每行 "id$ekey") ===
export function parseKeyMap(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    const sep = line.indexOf('$');
    if (sep <= 0 || sep !== line.lastIndexOf('$')) {
      throw new Error(`Invalid kgg.key line ${i + 1}: ${line.slice(0, 40)}`);
    }
    const id = line.slice(0, sep);
    const key = line.slice(sep + 1);
    if (id.length === 0 || key.length === 0) {
      throw new Error(`Invalid kgg.key line ${i + 1}: ${line.slice(0, 40)}`);
    }
    map.set(id, key);
  }
  return map;
}

export function serializeKeyMap(map: Map<string, string>): string {
  const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  return sorted.map(([id, key]) => `${id}$${key}`).join('\n') + '\n';
}

// === 内存密钥提供器 ===
export function memoryKeyProvider(map: Map<string, string>): KggKeyProvider {
  return {
    find(id: string) {
      return map.get(id) || null;
    },
    count() {
      return map.size;
    },
  };
}
