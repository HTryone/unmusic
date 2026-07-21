/// <reference lib="webworker" />
import { Decrypt } from '@/decrypt';

interface WorkerRequest {
  id: string;
  file: any;
  config: Record<string, any>;
}

interface WorkerResponse {
  id: string;
  result?: any;
  error?: string;
}

// Worker 的 postMessage 走 structured clone 算法。解密结果里的 `blob` 由
// `new Blob([audio])` 构造，而某些解密模块（ncm/qmc/kgm...）传入的 `audio`
// 是 Node 的 `Buffer` 实例（Uint8Array 子类但原型非标准）。个别浏览器会让
// Blob 内部持有对该 Buffer 的引用而非独立复制字节，导致克隆 Blob 时读取到
// 非标准视图而抛 DataCloneError。这里在发送前把任何不可克隆字段归一化：
//   - Blob  → 用 arrayBuffer() 重建为标准原生 Blob（字节为标准 ArrayBuffer）
//   - Buffer/类 TypedArray → 复制为标准 Uint8Array
async function cloneSafe(value: any): Promise<any> {
  const sc = (globalThis as any).structuredClone;
  if (!value || typeof value !== 'object') return value;
  if (sc) {
    try {
      sc(value);
      return value;
    } catch {
      // 落到逐字段重建
    }
  }
  const out: any = Array.isArray(value) ? [] : {};
  for (const key of Object.keys(value)) {
    const v = value[key];
    try {
      sc(v);
      out[key] = v;
    } catch (e) {
      console.warn(
        '[clone-diag] 非可克隆字段已归一化:',
        key,
        'type=', typeof v,
        'ctor=',
        (v as any)?.constructor?.name,
      );
      if (typeof Blob !== 'undefined' && v instanceof Blob) {
        const buf = await v.arrayBuffer();
        out[key] = new Blob([buf], { type: v.type });
      } else if (v && (v as any).buffer instanceof ArrayBuffer) {
        out[key] = new Uint8Array((v as any).buffer.slice(0));
      } else {
        out[key] = null;
      }
    }
  }
  return out;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, file, config } = e.data;
  try {
    const result = await Decrypt(file, config);
    let payload: any = result;
    try {
      (self as unknown as Worker).postMessage({ id, result });
    } catch (cloneErr) {
      console.warn('postMessage 结构化克隆失败，尝试归一化后重发', cloneErr);
      payload = await cloneSafe(result);
      (self as unknown as Worker).postMessage({ id, result: payload });
    }
  } catch (err) {
    const response: WorkerResponse = { id, error: String(err) };
    (self as unknown as Worker).postMessage(response);
  }
};
