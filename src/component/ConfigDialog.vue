<style scoped>
label {
  cursor: pointer;
  line-height: 1.2;
  display: block;
}
.item-desc {
  color: #aaa;
  font-size: small;
  display: block;
  line-height: 1.2;
  margin-top: 0.2em;
}
.item-desc a {
  color: #aaa;
}

form :deep(input) {
  font-family: 'Courier New', Courier, monospace;
}

:deep(.um-config-dialog) {
  max-width: 90%;
  width: 40em;
}

.kgg-key-list {
  margin-top: 0.6em;
  border: 1px solid #444;
  border-radius: 6px;
  padding: 0.4em 0.6em;
}
.kgg-key-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.3em;
  font-size: small;
  color: #ccc;
}
.kgg-key-scroll {
  max-height: 180px;
  overflow-y: auto;
}
.kgg-key-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.kgg-key-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.25em 0;
  border-bottom: 1px solid #333;
}
.kgg-key-list li:last-child {
  border-bottom: none;
}
.kgg-key-list code {
  font-family: 'Courier New', Courier, monospace;
  color: #9ad;
  word-break: break-all;
  margin-right: 0.5em;
}
</style>

<template>
  <el-dialog v-model="visible" title="解密设定" class="um-config-dialog" center>
    <el-form ref="form" :rules="rules" status-icon :model="form" label-width="0">
      <section>
        <label>
          <span>
            JOOX Music ·
            <Ruby caption="Unique Device Identifier">设备唯一识别码</Ruby>
          </span>
          <el-form-item prop="jooxUUID">
            <el-input type="text" v-model="form.jooxUUID" clearable maxlength="32" show-word-limit> </el-input>
          </el-form-item>
        </label>

        <p class="item-desc">
          下载该加密文件的 JOOX 应用所记录的设备唯一识别码。
          <br />
          参见：
          <a href="https://github.com/unlock-music/joox-crypto/wiki/%E8%8E%B7%E5%8F%96%E8%AE%BE%E5%A4%87-UUID">
            获取设备 UUID · unlock-music/joox-crypto Wiki</a
          >。
        </p>
      </section>

      <section>
        <label>
          <span>酷狗 KGG v5 密钥</span>
        </label>

        <p class="item-desc">
          解密 <code>.kgg</code> / <code>.kgg.flac</code> 文件需导入密钥。
          当前已导入 <b>{{ kggKeyCount }}</b> 个密钥。
        </p>

        <el-upload
          v-model:file-list="kggFileList"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="handleKggFileChange"
          accept=".db,.key"
          drag
        >
          <el-button type="primary" :loading="importing">导入 KGMusicV3.db 或 .kgg.key</el-button>
        </el-upload>

        <div v-if="kggKeyCount > 0" class="kgg-key-list">
          <div class="kgg-key-list-header">
            <span>密钥列表（共 {{ kggKeyCount }} 个）</span>
            <el-button type="danger" link size="small" :disabled="importing" @click="handleClearAll">
              清空全部
            </el-button>
          </div>
          <div class="kgg-key-scroll">
            <ul>
              <li v-for="id in kggKeyIds" :key="id">
                <code :title="id">{{ truncateId(id) }}</code>
                <el-button
                  type="danger"
                  link
                  size="small"
                  :disabled="importing"
                  @click="handleDeleteKey(id)"
                >
                  删除
                </el-button>
              </li>
            </ul>
          </div>
        </div>

        <p class="item-desc">
          酷狗 v20 的密钥库通常在
          <code>C:\Users\Htryone\AppData\Roaming\KuGou8\KGMusicV3.db</code>。
          导入后本地解密，密钥仅存于本机浏览器，不上传。
        </p>
      </section>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button type="primary" :loading="saving" @click="emitConfirm()">确 定</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { ElMessage } from 'element-plus';
import { storage } from '@/utils/storage';
import Ruby from './Ruby.vue';
import {
  importFromDbFile,
  importFromKeyFile,
  loadKeysMap,
  listKeyIds,
  deleteKey,
  clearKeys,
} from '@/utils/kgg-keys';
import type { UploadFile, UploadUserFile } from 'element-plus';

// FIXME: 看起来不会触发这个验证提示？
function validateJooxUUID(rule: any, value: any, callback: any) {
  if (!value || !/^[\da-fA-F]{32}$/.test(value)) {
    callback(new Error('无效的 Joox UUID，请参考 Wiki 获取。'));
  } else {
    callback();
  }
}

const rules = {
  jooxUUID: { validator: validateJooxUUID, trigger: 'change' },
};

export default defineComponent({
  components: {
    Ruby,
  },
  props: {
    show: { type: Boolean, required: true },
  },
  data() {
    return {
      rules,
      saving: false,
      importing: false,
      form: {
        jooxUUID: '',
      },
      kggKeyCount: 0,
      kggKeyIds: [] as string[],
      kggFileList: [] as UploadUserFile[],
    };
  },
  computed: {
    visible: {
      get(): boolean {
        return this.show;
      },
      set(val: boolean) {
        if (!val) {
          this.cancel();
        }
      },
    },
  },
  async mounted() {
    await this.resetForm();
  },
  methods: {
    async resetForm() {
      this.form.jooxUUID = await storage.loadJooxUUID();
      await this.refreshKggKeys();
    },

    async refreshKggKeys() {
      const map = await loadKeysMap();
      this.kggKeyCount = map.size;
      this.kggKeyIds = await listKeyIds();
    },

    truncateId(id: string): string {
      if (id.length <= 20) return id;
      return `${id.slice(0, 10)}…${id.slice(-8)}`;
    },

    async cancel() {
      await this.resetForm();
      this.$emit('done');
    },

    async emitConfirm() {
      this.saving = true;
      await storage.saveJooxUUID(this.form.jooxUUID);
      this.saving = false;
      this.$emit('done');
    },

    async handleKggFileChange(uploadFile: UploadFile) {
      if (!uploadFile.raw) return;
      this.importing = true;
      try {
        const fileName = uploadFile.name.toLowerCase();
        const result =
          fileName.endsWith('.key')
            ? await importFromKeyFile(uploadFile.raw)
            : await importFromDbFile(uploadFile.raw);
        await this.refreshKggKeys();
        ElMessage.success(`成功导入 ${result.added} 个新密钥，共 ${result.total} 个`);
      } catch (e: any) {
        ElMessage.error(`导入失败：${e?.message || e}`);
      } finally {
        this.importing = false;
        this.kggFileList = [];
      }
    },

    async handleDeleteKey(id: string) {
      const total = await deleteKey(id);
      await this.refreshKggKeys();
      ElMessage.success(`已删除 1 个密钥，剩余 ${total} 个`);
    },

    async handleClearAll() {
      await clearKeys();
      await this.refreshKggKeys();
      ElMessage.success('已清空全部 KGG 密钥');
    },
  },
});
</script>
