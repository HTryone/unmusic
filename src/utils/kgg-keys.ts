/**
 * KGG 密钥管理工具
 *
 * 负责：
 *   - 从 localStorage 加载/保存 KGG 密钥映射 (格式: "id$ekey" 每行一条)
 *   - 从 KGMusicV3.db (酷狗加密 SQLite) 解密并提取密钥
 *   - 从 .kgg.key 文本文件解析密钥
 *
 * 移植自 OpenConverter (Apache 2.0) 的 src/main/kgg-keys.js
 * 浏览器适配：去掉 WMI 全盘扫描，改用手动文件导入
 */

import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
// Vite 会把 wasm 作为资源处理并返回其 URL
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

import { decryptDatabaseBuffer } from '@/decrypt/kgg/db-cipher';
import {
  parseKeyMap,
  serializeKeyMap,
  memoryKeyProvider,
  type KggKeyProvider,
} from '@/decrypt/kgg/index';
import { storage } from '@/utils/storage';

let sqlJsInstance: SqlJsStatic | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsInstance) {
    sqlJsInstance = await initSqlJs({ locateFile: () => sqlWasmUrl });
  }
  return sqlJsInstance;
}

/**
 * 从解密后的 SQLite 数据库 Buffer 提取密钥映射
 */
export async function importFromDb(dbBuffer: ArrayBuffer): Promise<Map<string, string>> {
  const SQL = await getSqlJs();
  const decrypted = decryptDatabaseBuffer(Buffer.from(dbBuffer));
  const db: Database = new SQL.Database(new Uint8Array(decrypted));
  const result = new Map<string, string>();
  try {
    const stmt = db.prepare(`
      SELECT EncryptionKeyId, EncryptionKey FROM ShareFileItems
      WHERE EncryptionKeyId IS NOT NULL AND EncryptionKeyId != ''
        AND EncryptionKey IS NOT NULL AND EncryptionKey != ''
    `);
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      result.set(String(row.EncryptionKeyId), String(row.EncryptionKey));
    }
    stmt.free();
  } finally {
    db.close();
  }
  return result;
}

/**
 * 从 .kgg.key 文本文件内容解析密钥映射
 */
export function loadKeysMapFromText(text: string): Map<string, string> {
  return parseKeyMap(text);
}

/**
 * 从 localStorage 加载已保存的密钥映射
 */
export async function loadKeysMap(): Promise<Map<string, string>> {
  const text = await storage.loadKggKeys('');
  if (!text) return new Map();
  try {
    return parseKeyMap(text);
  } catch {
    return new Map();
  }
}

/**
 * 保存密钥映射到 localStorage
 */
export async function saveKeysMap(map: Map<string, string>): Promise<void> {
  await storage.saveKggKeys(serializeKeyMap(map));
}

/**
 * 从 KGMusicV3.db 文件导入密钥，合并到已保存的映射中
 * @returns 新增数量和总数量
 */
export async function importFromDbFile(file: File): Promise<{ added: number; total: number }> {
  const buffer = await file.arrayBuffer();
  const incoming = await importFromDb(buffer);

  const currentMap = await loadKeysMap();
  const initialSize = currentMap.size;

  for (const [id, val] of incoming.entries()) {
    currentMap.set(id, val);
  }

  const newSize = currentMap.size;
  if (newSize > initialSize) {
    await saveKeysMap(currentMap);
  }

  return { added: newSize - initialSize, total: newSize };
}

/**
 * 从 .kgg.key 文本文件导入密钥，合并到已保存的映射中
 */
export async function importFromKeyFile(file: File): Promise<{ added: number; total: number }> {
  const text = await file.text();
  const incoming = loadKeysMapFromText(text);

  const currentMap = await loadKeysMap();
  const initialSize = currentMap.size;

  for (const [id, val] of incoming.entries()) {
    currentMap.set(id, val);
  }

  const newSize = currentMap.size;
  if (newSize > initialSize) {
    await saveKeysMap(currentMap);
  }

  return { added: newSize - initialSize, total: newSize };
}

/**
 * 获取当前密钥提供器 (从 localStorage 加载)
 */
export async function getKeyProvider(): Promise<KggKeyProvider> {
  const map = await loadKeysMap();
  return memoryKeyProvider(map);
}
