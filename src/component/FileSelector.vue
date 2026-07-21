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
import { defineComponent } from 'vue';
import { Upload, InfoFilled } from '@element-plus/icons-vue';
import { DecryptQueue } from '@/utils/utils';
import { storage } from '@/utils/storage';

interface WorkerTask {
  file: any;
  config: Record<string, any>;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
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
      worker.postMessage({ id, file: task.file, config: task.config });
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
      this.pool = new NativeWorkerPool(navigator.hardwareConcurrency || 1);
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
      if (this.pool) {
        this.pool
          .run(file, config)
          .then((result) => this.$emit('success', result))
          .catch((err) => this.$emit('error', err, file.name))
          .finally(() => this.task_finished++);
      } else {
        this.queue.queue(async () => {
          console.log('start handling', file.name);
          try {
            this.$emit('success', await (await import('@/decrypt')).Decrypt(file, config));
          } catch (e) {
            console.error(e);
            this.$emit('error', e, file.name);
          } finally {
            this.task_finished++;
          }
        });
      }
    },
  },
});
</script>
