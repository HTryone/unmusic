<template>
  <el-upload :auto-upload="false" :on-change="addFile" :show-file-list="false" action="" drag multiple>
    <el-icon class="el-icon-upload"><Upload /></el-icon>
    <div class="el-upload__text">将文件拖到此处，或 <em>点击选择</em></div>
    <template #tip>
      <div class="el-upload__tip">
      <div>
        仅在浏览器内对文件进行解锁，无需消耗流量
        <el-tooltip effect="dark" placement="top-start">
          <template #content>算法在源代码中已经提供，所有运算都发生在本地</template>
          <el-icon style="font-size: 12px"><InfoFilled /></el-icon>
        </el-tooltip>
      </div>
      <div>
        工作模式: {{ parallel ? '多线程 Worker' : '单线程 Queue' }}
        <el-tooltip effect="dark" placement="top-start">
          <template #content>
            将此工具部署在HTTPS环境下，可以启用Web Worker特性，<br />
            从而更快的利用并行处理完成解锁
          </template>
          <el-icon style="font-size: 12px"><InfoFilled /></el-icon>
        </el-tooltip>
      </div>
    </div>
  </template>
  <transition name="el-fade-in"
      ><!--todo: add delay to animation-->
      <el-progress
        v-show="progress_show"
        :format="progress_string"
        :percentage="progress_value"
        :stroke-width="16"
        :text-inside="true"
        style="margin: 16px 6px 0 6px"
      ></el-progress>
    </transition>
  </el-upload>
</template>

<script lang="ts">
import { defineComponent, toRaw, markRaw } from 'vue';
import { Upload, InfoFilled } from '@element-plus/icons-vue';
import { DecryptQueue } from '@/utils/utils';
import { storage } from '@/utils/storage';

interface WorkerTask {
  file: any;
  config: Record<string, any>;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

// 主线程 -> Worker 的结构化克隆预检：Vue 响应式 Proxy / 非标准对象会导致
// worker.postMessage 抛 DataCloneError（报错形如 `#<...> could not be cloned`）。
// 发送前先逐字段卸掉 Proxy 并尝试克隆，失败则收集诊断并回退主线程执行。
function cloneForWorker(value: any): any {
  const sc = (globalThis as any).structuredClone;
  const deproxy = (v: any) => {
    try {
      const raw = toRaw(v);
      if (raw !== v) return raw;
    } catch {
      /* 非响应式对象，忽略 */
    }
    return v;
  };
  if (value === null || typeof value !== 'object') return value;
  if (typeof File !== 'undefined' && value instanceof File) return value;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value;
  if (sc) {
    try {
      const cleaned: any = Array.isArray(value) ? [] : {};
      for (const k of Object.keys(value)) {
        cleaned[k] = deproxy(value[k]);
      }
      return sc(cleaned);
    } catch {
      const bad: string[] = [];
      for (const k of Object.keys(value)) {
        try {
          sc(deproxy(value[k]));
        } catch {
          bad.push(`${k}(${(value[k] as any)?.constructor?.name})`);
        }
      }
      throw new Error(`DataCloneError 预检失败，不可克隆字段: [${bad.join(', ')}]`);
    }
  }
  return JSON.parse(JSON.stringify(value));
}

class NativeWorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private taskQueue: WorkerTask[] = [];
  private handlers = new Map<string, (e: MessageEvent) => void>();

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('../utils/worker.ts', import.meta.url), { type: 'module' });
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  run(file: any, config: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ file, config, resolve, reject });
      this.schedule();
    });
  }

  private schedule() {
    while (this.idle.length > 0 && this.taskQueue.length > 0) {
      const worker = this.idle.pop()!;
      const task = this.taskQueue.shift()!;
      const id = Math.random().toString(36).slice(2);
      const handler = (e: MessageEvent) => {
        if (e.data?.id !== id) return;
        worker.removeEventListener('message', handler);
        this.handlers.delete(id);
        this.idle.push(worker);
        if (e.data.error) task.reject(new Error(e.data.error));
        else task.resolve(e.data.result);
        this.schedule();
      };
      this.handlers.set(id, handler);
      worker.addEventListener('message', handler);
      try {
        worker.postMessage({
          id,
          file: cloneForWorker(task.file),
          config: cloneForWorker(task.config),
        });
      } catch (cloneErr) {
        console.warn('[worker] 主线程→Worker 克隆失败，回退主线程执行', cloneErr);
        worker.removeEventListener('message', handler);
        this.handlers.delete(id);
        this.idle.push(worker);
        void this.runOnMainThread(task);
        this.schedule();
      }
    }
  }

  private async runOnMainThread(task: WorkerTask) {
    try {
      const decryptMod = await import('@/decrypt');
      const result = await decryptMod.Decrypt(task.file, task.config);
      task.resolve(result);
    } catch (err) {
      task.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  destroy() {
    this.workers.forEach((w) => w.terminate());
  }
}

export default defineComponent({
  name: 'FileSelector',
  components: {
    Upload,
    InfoFilled,
  },
  data() {
    return {
      task_all: 0,
      task_finished: 0,
      queue: new DecryptQueue(), // for http or file protocol
      pool: null as NativeWorkerPool | null,
      parallel: false,
    };
  },
  computed: {
    progress_value() {
      return this.task_all ? (this.task_finished / this.task_all) * 100 : 0;
    },
    progress_show() {
      return this.task_all !== this.task_finished;
    },
  },
  mounted() {
    if (window.Worker && window.location.protocol !== 'file:' && import.meta.env.PROD) {
      console.log('Using Native Worker Pool');
      // 必须用 markRaw：NativeWorkerPool 存进组件响应式 data 后会被 Vue 包成
      // reactive Proxy，连带 taskQueue 里的每个任务对象（含 file/config）也变成
      // Proxy。Worker.postMessage 走结构化克隆，不支持 Proxy，会抛 DataCloneError。
      // markRaw 让 pool 脱离响应式，任务保持普通对象即可正常克隆。
      this.pool = markRaw(new NativeWorkerPool(navigator.hardwareConcurrency || 1));
      this.parallel = true;
    } else {
      console.log('Using Queue in Main Thread');
    }
  },
  beforeUnmount() {
    this.pool?.destroy();
  },
  methods: {
    progress_string() {
      return `${this.task_finished} / ${this.task_all}`;
    },
    async addFile(file: any) {
      this.task_all++;
      const config = await storage.getAll();
      // el-upload 的 on-change 传入的是 Vue 响应式代理的 UploadFile（其 .raw 也是代理）。
      // 结构化克隆算法不支持 Proxy，会直接让 Worker 的 postMessage 抛 DataCloneError；
      // 而 dev 模式走主线程队列、不经过 postMessage，所以只有成品（PROD）才暴露该问题。
      // 这里用 toRaw 取出真实对象，并只保留解密所需的 {name, raw} 纯字段再发给 Worker。
      const f = toRaw(file);
      const rawFile = toRaw(f.raw || f);
      const filePayload = { name: f.name ?? rawFile.name, raw: rawFile };
      if (this.pool) {
        this.pool
          .run(filePayload, config)
          .then((result) => this.$emit('success', result))
          .catch((err) => this.$emit('error', err, filePayload.name))
          .finally(() => this.task_finished++);
      } else {
        this.queue.queue(async () => {
          console.log('start handling', filePayload.name);
          try {
            this.$emit('success', await (await import('@/decrypt')).Decrypt(filePayload, config));
          } catch (e) {
            console.error(e);
            this.$emit('error', e, filePayload.name);
          } finally {
            this.task_finished++;
          }
        });
      }
    },
  },
});
</script>
