# Unlock Music 音乐解锁（个人本地部署版）

在浏览器中解锁加密的音乐文件。所有解密运算都在你本地的浏览器里完成，**文件不会上传到任何服务器**。

> 本仓库是个人复刻 / 本地化部署版本，基于 [Ting-fYuan/unlock_music](https://github.com/Ting-fYuan/unlock_music)（Unlock Music 原版 web 的 Vue 2 分支）迁移而来，已升级到 Vue 3 + Vite。
> 大批量转换建议使用原项目的 CLI 版本（`unlock-music/cli`，原托管于 `git.unlock-music.dev`，当前暂不可访问）。

## 特性

### 支持的格式

- [x] 网易云音乐格式 (`.ncm`)
- [x] QQ 音乐 (`.qmc0/.qmc2/.qmc3/.qmcflac/.qmcogg/.tkm`)
- [x] QQ 音乐新格式 (`.mflac/.mgg/.mflac0/.mgg1/.mggl`)
- [x] QQ 音乐 Tm 格式 (`.tm0/.tm2/.tm3/.tm6`)
- [x] Moo 音乐格式 (`.bkcmp3/.bkcflac/...`)
- [x] 酷狗音乐格式 (`.kgm/.vpr`)
- [x] 酷我音乐格式 (`.kwm`)
- [x] 虾米音乐格式 (`.xm`)
- [x] 咪咕音乐格式 (`.mg3d`)
- [x] 喜马拉雅 Android 格式 (`.x2m/.x3m`)
- [x] 其他 (`.bkc/.mogg/.ygg` 等)

### 其他特性

- [x] 纯前端，浏览器内解锁
- [x] 拖放 / 批量解锁
- [x] 渐进式 Web 应用 (PWA)，可离线安装
- [x] 多线程解密（Web Worker 池）
- [x] 写入与编辑元信息、专辑封面
- [x] 深色模式（跟随系统 `prefers-color-scheme`，设置页等暗色配色已优化）
- [x] 小屏 / 移动端响应式布局（窄屏自适应；解密设定弹窗宽屏约占 60% / 窄屏约占 90%）

## 目录结构

```
source/
├── dist/           # npm run build 的产物，已构建好的成品
├── src/            # 源码
├── LICENSE         # MIT 许可证
├── README.md       # 本文件
└── start-dist.bat  # 一键启动已构建成品（端口 8787）
```

`source/` 是迁移到 Vue 3 + Vite 后的源码工程，也是本仓库的根目录。

## 更多文档

- [工作区结构说明](工作区结构说明.md)：对 `dist/` 构建产物、各源码目录与文件的详细职责，以及构建原理（`local` 静态资源 vs `dist` 构建产物对比）的说明。

## 使用方法

### 方式一：直接用已构建成品（最简单）

`npm run build` 后会生成 `source/dist/`，**里面自带一份 `start-dist.bat`**（构建时由 `public/` 自动拷入）。有两种用法：

**A. 开发仓库里（源码目录）**
1. 进入 `source/` 目录，双击 **`start-dist.bat`**。
2. 脚本检测到同级 `dist/` 目录，进入其中启动服务，自动打开浏览器 `http://localhost:8787`。
3. 把加密音乐文件拖进页面即可。关闭终端窗口即停止服务。

**B. 发行版（.zip 压缩包）—— 给别人用 / 自己部署**
1. 把 `source/dist/` 整个文件夹压缩成 zip（如 `unmusic-dist.zip`）。
2. 把 zip 发给别人，或拷到任意位置解压。
3. 解压后目录里 `index.html` 与 `start-dist.bat` **在同一目录**，双击 `start-dist.bat` 即可。
   - 脚本检测到当前目录**没有** `dist/` 子目录，就以自身所在目录为准起服务，自动打开浏览器 `http://localhost:8787`。
   - 解压位置**随意**（桌面、D 盘等均可），不依赖 `source/` 或其他路径。
4. 把加密音乐文件拖进页面即可。关闭终端窗口即停止服务。

> 该脚本用 `python -m http.server` 托管，**不经过 PWA Service Worker**，不会有"刷新才更新"的缓存问题。前提是系统已安装 Python 且 `python` 在 PATH 中。

### 方式二：从源码开发 / 重新构建

环境要求：**Node.js 18+**、npm。

```sh
# 在 source/ 目录下
npm install        # 安装依赖

npm run dev        # 启动开发服务器（默认 http://localhost:5173）
npm run build      # 构建生产产物，输出到 dist/
npm run preview    # 本地预览构建产物（Vite，默认 http://localhost:4173）
npm run type-check # 类型检查（vue-tsc）
```

构建出的 `dist/` 是纯静态站点，可直接部署到任意静态托管服务。

### 方式三：发版 / 部署到线上（Cloudflare Pages）

线上站：<https://unmusic-8ml.pages.dev/>。每次发新版**只改 `package.json` 一处**，其余全自动：

1. **改 `package.json`**（两个相邻字段）：
   - `version`：新版本号（如 `F2.1.0`）。既是页面显示/烧进 bundle 的"本地版本"，也是线上校验版本的来源。
   - `updateInfo`：本次更新说明。同时用于蓝色"离线使用"通知的"最近更新"和橙色"发现新版本"的更新详情。
2. **构建**：`npm run build`。build 时会**自动**据 `package.json` 生成 `dist/version.json`（`Version`←`version`、`Detail`←`updateInfo`、`URL`=发行版仓库地址），无需手动维护。
3. **部署**：把 `dist/` 发布到 Cloudflare Pages。
4. （可选）**更新发行版**：把新 `dist/` 压缩成 zip 分发。

部署生效后：
- 老 PWA 用户 / 发行版用户打开页面 → 读到线上 `version.json` 版本号比自己新 → 弹"发现新版本"提醒（PWA/线上弹「立即更新」按钮，发行版弹「前往下载新版」链接）。
- 版本号一致时不弹更新提醒，只弹常规"离线使用"通知。

> 版本号自动同源于 `package.json`，不会再出现"两处版本号不一致"的问题。
> 发行版下载链接写在 `vite.config.ts` 的 `generateVersionJson` 插件常量 `RELEASE_URL` 里，换仓库时改那一处即可（几乎不用动）。

## 已知限制

- **QQ 音乐 musicex 格式需 VIP Cookie + 代理**：musicex（文件尾 `musicex\0`，部分下载文件挂 `.mflac`/`.mgg` 后缀）密钥不在文件内，须在「解锁设定」填入 VIP Cookie 与 API 代理地址（设置页提供 `scan_qq_cookie` 脚本与 `qq-proxy.js` 下载）。STag / QTag 格式已可纯本地解密，无需 Cookie。
- **必须走 HTTP 服务器**：ES 模块在 `file://` 协议下受 CORS 限制，不能直接双击 `index.html` 打开。请用上面的启动脚本或任意静态服务器访问。

## 参与修改 / 开发者指南

如果要在本项目基础上修改或扩展功能，需要满足以下条件。

### 环境要求
- **Node.js 18+**（Vite 5 要求；推荐用 LTS 版本，如 18.x / 20.x）
- **npm**（随 Node 自带）
- 一条可用的 `python` 命令（仅 `start-dist.bat` 起本地预览时需要，可选）

### 安装与常用命令
```sh
npm install        # 安装依赖（首次 clone 或改了 package.json 后）
npm run dev        # 开发模式，热更新，默认 http://localhost:5173
npm run build      # 生产构建，输出到 dist/
npm run preview    # 本地预览 dist/（Vite，默认 http://localhost:4173）
npm run type-check # 类型检查（vue-tsc --noEmit）
npm run pretty     # 用 Prettier 格式化 src/ 下的代码
```

### 代码组织（要改哪类功能去哪）
- `src/decrypt/` —— 各平台解密模块（`ncm` / `qmc` / `kgm` / `mgg` …），新增格式从这里加
- `src/component/` —— 上传、结果表格、元信息编辑等 UI 组件
- `src/view/` —— 页面级组件（如 `Home.vue`）
- `src/utils/` —— Worker 池、本地存储、元信息写入等工具
- `vite.config.ts` —— 构建、代码分割、PWA、Node polyfill 的总配置

### 注意事项（踩过的坑）
- **不要把持有任务队列 / 回调的类实例（如 Worker Pool）存进组件的响应式 `data()`**：Vue 会把它整体包成 `Proxy`，传给 `Worker.postMessage` 时结构化克隆不支持 Proxy，会抛 `DataCloneError`。正确做法是用 `markRaw()` 包裹实例。
- **解密结果若经 `postMessage` 传出**：避免在 `Blob` 里持有 Node `Buffer`，用 `new Uint8Array(...)` 转成标准 TypedArray。
- **WASM 解密依赖** `@xhacker/qmcwasm` / `@xhacker/kgmwasm`，由 `vite-plugin-node-polyfills` 注入 Buffer 等 Node 兼容层；改动打包配置时勿移除，否则 Worker 内会报 `Buffer is not defined`。
- **纯前端、必须走 HTTP**：不能直接双击 `file://` 打开，需用启动脚本或静态服务器。
- **QQ 音乐 STag 目前无法在 Web 端解密**（密钥在客户端本地库），相关需求需降级 QQ 音乐客户端。

## 关于本项目

本仓库基于 [Ting-fYuan/unlock_music](https://github.com/Ting-fYuan/unlock_music)（即 Unlock Music 原版 web 的 GitHub 镜像，Vue 2 版本；也是本项目的直接上游 / 迁移起点）迁移到 Vue 3 + Vite。其原始项目为 Unlock Music 团队（GPL-3.0；官方站点 `git.unlock-music.dev` 当前暂不可访问）。本仓库所用源码以 **MIT 许可证** 分发（见仓库内 `LICENSE` 文件，Copyright © 2019-2023 MengYX, © 2026 HTryone）。修改、再分发请保留原作者版权声明与许可证文本。

技术栈：Vue 3 + Vite 5 + Element Plus + TypeScript（由原 Vue 2 + Vue CLI 版本迁移而来）。
