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
          解密 <code>.kgg</code> / <code>.kgg.flac</code> 文件需要导入密钥。
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

        <p class="item-desc">
          Windows 用户可在
          <code>C:\Users\Public\KuGou\KGMusic\KGMusicV3.db</code>
          找到密钥数据库。导入后本地解密，不上传。
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
import { importFromDbFile, importFromKeyFile, loadKeysMap } from '@/utils/kgg-keys';
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
      kggFileList: [] as UploadUserFile[],
      centerDialogVisible: false,
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
      const map = await loadKeysMap();
      this.kggKeyCount = map.size;
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
        const result = fileName.endsWith('.key')
          ? await importFromKeyFile(uploadFile.raw)
          : await importFromDbFile(uploadFile.raw);
        this.kggKeyCount = result.total;
        ElMessage.success(`成功导入 ${result.added} 个新密钥，共 ${result.total} 个`);
      } catch (e: any) {
        ElMessage.error(`导入失败：${e?.message || e}`);
      } finally {
        this.importing = false;
        this.kggFileList = [];
      }
    },
  },
});
</script>
