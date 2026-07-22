<style scoped>
label {
  cursor: pointer;
  line-height: 1.2;
  display: block;
}
/* 分组标题：深黑加粗 + 下分隔线，与注释明显区分 */
section > label > span {
  display: block;
  font-weight: 700;
  font-size: 15px;
  color: #1f1f1f;
  padding-bottom: 0.3em;
  margin-bottom: 0.1em;
  border-bottom: 1px solid #ebeef5;
}
/* 各组之间留间隔并加淡分隔，分类更清楚 */
section {
  padding: 0.5em 0;
  border-bottom: 1px solid #f2f2f2;
}
section:last-child {
  border-bottom: none;
}
.item-desc {
  color: #555;
  font-size: small;
  display: block;
  line-height: 1.5;
  margin-top: 0.35em;
}
.item-desc a {
  color: #555;
}
.item-desc code {
  font-family: 'Courier New', Courier, monospace;
  background: #f4f4f5;
  color: #c7254e;
  padding: 0 4px;
  border-radius: 3px;
}
.item-desc .script-link {
  display: inline-block;
  padding: 4px 10px;
  border: 1px solid #409eff;
  border-radius: 4px;
  background: rgba(64, 158, 255, 0.08);
  color: #409eff;
  text-decoration: none;
  font-size: 12px;
  line-height: 1.5;
  transition: all 0.2s;
  margin-right: 6px;
}
.item-desc .script-link:hover {
  background: #409eff;
  color: #fff;
  text-decoration: none;
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
          解密 <code>.musicex</code> 等无内嵌密钥格式的 QQ 音乐加密文件时需要 VIP Cookie。
          浏览器打开 <code>y.qq.com</code> → 按 <code>F12</code> → 网络 → 随便一个请求 → 复制请求头的 <code>Cookie</code> → 粘贴到下方。
          仅存于本机浏览器，不上传。
        </p>

        <el-form-item prop="qqCookie">
          <el-input
            type="textarea"
            :rows="3"
            v-model="form.qqCookie"
            clearable
            resize="vertical"
            placeholder="粘贴 Cookie，包含 qqmusic_key / qqmusic_uin 即可"
          >
          </el-input>
        </el-form-item>

        <p class="item-desc">当前状态：<b>{{ qqCookieSet ? '已保存' : '未设置' }}</b>。</p>

        <p class="item-desc">
          <a class="script-link" :href="scriptHref('scan_qq_cookie.bat')" download>下载 scan_qq_cookie.bat</a>
          <a class="script-link" :href="scriptHref('scan_qq_cookie.ps1')" download>下载 scan_qq_cookie.ps1</a>
          <span>嫌手动复制 Cookie 麻烦，可用它一键从 QQ 音乐客户端提取。<b>两个文件需放在同一目录</b>（.bat 双击后会调用同目录的 .ps1）。</span>
        </p>
      </section>

      <section>
        <label>
          <span>QQ 音乐 uin（QQ 号）</span>
        </label>

        <p class="item-desc">
          解密失败提示 <code>104003</code> 时填 QQ 号，否则留空即可。
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

        <p class="item-desc">当前状态：<b>{{ qqUinSet ? '已填写' : '未填写' }}</b>。</p>
      </section>

      <section>
        <label>
          <span>QQ 音乐 API 代理地址</span>
        </label>

        <p class="item-desc">
          直接填 <code>https://unmusic-proxy.xianshenghu363.workers.dev</code> 即可；想用自己的，按使用提示里的「部署代理」教程自行部署后替换。
        </p>

        <el-form-item prop="qqProxy">
          <el-input
            type="text"
            v-model="form.qqProxy"
            clearable
            placeholder="https://unmusic-proxy.xianshenghu363.workers.dev"
          >
          </el-input>
        </el-form-item>

        <p class="item-desc">当前状态：<b>{{ qqProxySet ? '已设置' : '未设置' }}</b>。</p>

        <p class="item-desc">
          <a class="script-link" :href="scriptHref('qq-proxy.js')" download>下载 Cloudflare Worker 代理脚本</a>
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
import {
  importFromDbFile,
  importFromKeyFile,
  loadKeysMap,
  listKeyIds,
  deleteKey,
  clearKeys,
} from '@/utils/kgg-keys';
import type { UploadFile, UploadUserFile } from 'element-plus';

const rules = {};

export default defineComponent({
  props: {
    show: { type: Boolean, required: true },
  },
  data() {
    return {
      rules,
      saving: false,
      importing: false,
      form: {
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

    scriptHref(file: string): string {
      const base = import.meta.env.BASE_URL || '/';
      return base + 'scripts/' + file;
    },

    async cancel() {
      await this.resetForm();
      this.$emit('done');
    },

    async emitConfirm() {
      this.saving = true;
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
