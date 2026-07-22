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

form :deep(input),
form :deep(textarea) {
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

      <section>
        <label>
          <span>QQ 音乐 Cookie</span>
        </label>

        <p class="item-desc">
          解密 <code>.musicex</code> 等<strong>无内嵌密钥</strong>的 QQ 音乐加密文件需要登录态 Cookie。
          在浏览器打开 <code>y.qq.com</code> 并登录 VIP 账号，按
          <code>F12</code> → 网络(Network) → 任意请求 → 复制请求头中的 <code>Cookie</code> 字段，粘贴到下方。
          仅存于本机浏览器，不上传。
        </p>

        <el-form-item prop="qqCookie">
          <el-input
            type="textarea"
            :rows="3"
            v-model="form.qqCookie"
            clearable
            resize="vertical"
            placeholder="粘贴 QQ 音乐 Cookie，例如：uin=o123456; qqmusic_key=xxx; psrf_access_token=xxx"
          >
          </el-input>
        </el-form-item>

        <p class="item-desc">当前状态：<b>{{ qqCookieSet ? '已保存' : '未设置' }}</b>。Cookie 含登录凭证，请勿分享；登出或改密后需重新粘贴。</p>
      </section>

      <section>
        <label>
          <span>QQ 音乐 uin（QQ 号）</span>
        </label>

        <p class="item-desc">
          部分登录方式（如 QQ 互联 / 微信登录）的 Cookie 不含 <code>uin</code>，而 vkey 接口需靠
          <code>uin</code> 校验 VIP 权限；缺失时会返回 <code>result:104003</code> 且无法解密。
          请在此填写你的<strong>QQ 号（数字）</strong>，留空则尝试从 Cookie 中读取。
        </p>

        <el-form-item prop="qqUin">
          <el-input
            type="text"
            v-model="form.qqUin"
            clearable
            maxlength="20"
            placeholder="你的 QQ 号，例如：123456789"
          >
          </el-input>
        </el-form-item>

        <p class="item-desc">当前状态：<b>{{ qqUinSet ? '已填写' : '未填写（将从 Cookie 读取）' }}</b>。</p>
      </section>

      <section>
        <label>
          <span>QQ 音乐 API 代理地址</span>
        </label>

        <p class="item-desc">
          浏览器受 CORS 限制无法直接调用 <code>u.y.qq.com</code>，需经代理转发。
          部署一个 Cloudflare Worker（转发 <code>/cgi-bin/musicu.fcg</code> 并加 CORS 头）后，把其地址填到这里。
          <br />
          留空则默认走开发代理 <code>/qq-api</code>（仅 <code>npm run dev</code> 生效）。
        </p>

        <el-form-item prop="qqProxy">
          <el-input
            type="text"
            v-model="form.qqProxy"
            clearable
            placeholder="https://your-worker.xxx.workers.dev （留空用开发代理 /qq-api）"
          >
          </el-input>
        </el-form-item>

        <p class="item-desc">当前状态：<b>{{ qqProxySet ? '已设置' : '未设置（用 /qq-api）' }}</b>。</p>
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
        qqCookie: '',
        qqUin: '',
        qqProxy: '',
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
    qqCookieSet(): boolean {
      return !!this.form.qqCookie && this.form.qqCookie.trim().length > 0;
    },
    qqProxySet(): boolean {
      return !!this.form.qqProxy && this.form.qqProxy.trim().length > 0;
    },
    qqUinSet(): boolean {
      return !!this.form.qqUin && this.form.qqUin.trim().length > 0;
    },
  },
  async mounted() {
    await this.resetForm();
  },
  methods: {
    async resetForm() {
      this.form.jooxUUID = await storage.loadJooxUUID();
      this.form.qqCookie = await storage.loadQQCookie();
      this.form.qqUin = await storage.loadQQUin();
      this.form.qqProxy = await storage.loadQQProxy();
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
      await storage.saveQQCookie(this.form.qqCookie.trim());
      await storage.saveQQUin(this.form.qqUin.trim());
      await storage.saveQQProxy(this.form.qqProxy.trim());
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
