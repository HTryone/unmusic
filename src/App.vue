<template>
  <el-container id="app">
    <el-main>
      <Home />
    </el-main>
    <el-footer id="app-footer">
      <el-row>
        <span>unmusic</span> ({{ version }})
      </el-row>
      <el-row>
        移除已购音乐加密保护 | 支持 ncm, qmc, mflac, mgg, kgm, kwm 等格式
      </el-row>
      <el-row class="footer-links">
        <span>© 2026 HTryone</span>
        ·
        <a href="https://github.com/HTryone/unmusic" target="_blank">源码</a>
        ·
        <a href="https://github.com/HTryone/unmusic/blob/master/LICENSE" target="_blank">MIT 许可</a>
        ·
        <a href="./use-hint.html" target="_blank">使用提示</a>
      </el-row>
    </el-footer>
  </el-container>
</template>

<script>
import FileSelector from '@/component/FileSelector.vue';
import PreviewTable from '@/component/PreviewTable.vue';
import config from '@/../package.json';
import Home from '@/view/Home.vue';
import { checkUpdate } from '@/utils/api';

export default {
  name: 'app',
  components: {
    FileSelector,
    PreviewTable,
    Home,
  },
  data() {
    return {
      version: config.version,
    };
  },
  created() {
    this.$nextTick(() => this.finishLoad());
  },
  methods: {
    // 强制更新：注销 Service Worker + 清空 CacheStorage 后重载。
    // 等效于用户手动 Ctrl+Shift+R，确保旧 SW/旧预缓存不会把页面锁在旧版本。
    async forceUpdate() {
      // registerType:'autoUpdate' + workbox skipWaiting/clientsClaim 已配：
      // 新部署后新 SW 会自动接管、预缓存新版资源。这里无需手动 unregister/遍历清
      // caches（那步很重且与自动更新冲突，会卡顿）。只绕过 HTTP 缓存强制刷新，
      // 让新 SW 生效即可；reload 后若仍有旧缓存，新 SW 的 cleanupOutdatedCaches 会清。
      window.location.replace(window.location.pathname + '?_t=' + Date.now());
    },
    async finishLoad() {
      const mask = document.getElementById('loader-mask');
      if (!!mask) mask.remove();
      let updateInfo;
      try {
        updateInfo = await checkUpdate(this.version);
      } catch (e) {
        console.warn('check version info failed', e);
      }
      if (
        updateInfo &&
        import.meta.env.PROD &&
        (updateInfo.HttpsFound || (updateInfo.Found && window.location.protocol !== 'https:'))
      ) {
        // 文案分流：线上/PWA 用户点击「立即更新」按钮强制刷新拿新版；
        // 发行版（localhost 本地跑 dist）需要去线上站获取新包。
        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        // 通知里的 HTML 字符串无法直接绑定 Vue 事件，挂到 window 供 onclick 调用
        window.__umForceUpdate = () => this.forceUpdate();
        const btnStyle =
          'display:inline-block;margin-top:6px;padding:5px 14px;border-radius:4px;' +
          'background:#e6a23c;color:#fff;font-weight:bold;cursor:pointer;text-decoration:none;';
        const action = isLocal
          ? `<a target="_blank" href="${updateInfo.URL}" style="${btnStyle}">前往下载新版</a>`
          : `<a href="javascript:void(0)" onclick="window.__umForceUpdate()" style="${btnStyle}">立即更新</a>`;
        this.$notify.warning({
          title: '发现更新',
          message: `发现新版本 ${updateInfo.Version}<br/>更新详情：${updateInfo.Detail}<br/>${action}`,
          dangerouslyUseHTMLString: true,
          duration: 0, // 常驻，直到用户点按钮或手动关闭
          position: 'top-left',
        });
      } else {
        this.$notify.info({
          title: '离线使用',
          message: `<div>
                        <p>我们使用 PWA 技术，无网络也能使用</p>
                        <div class="update-info">
                            <div class="update-title">最近更新</div>
                            <div class="update-content"> ${config.updateInfo} </div>
                        </div>
                        <a target="_blank" href="./use-hint.html">使用提示</a>
                    </div>`,
          dangerouslyUseHTMLString: true,
          duration: 10000,
          position: 'top-left',
        });
      }
    },
  },
};
</script>
