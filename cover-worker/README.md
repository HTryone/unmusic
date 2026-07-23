# 封面代理 Worker（Cloudflare Workers）

> 替代已停服的 `um-api.ixarea.com`，**仅用于给 QQ 系加密音乐补全在线专辑封面**。
> **本 Worker 不负责解密**——解密完全在前端本地（Web Worker）完成，与任何远端服务无关。

## 一、它做了什么

| 端点 | 作用 | 数据源 |
|------|------|--------|
| `GET /music/qq-cover?Title=&Artist=&Album=` | 调用 QQ 匿名搜索接口，返回专辑封面 ID | QQ `client_search_cp`（带 Referer/UA） |
| `GET /music/qq-cover/{type}/{pmid}` | 从 QQ 公开 CDN（gtimg）取封面图，并补上 CORS 头 | `y.gtimg.cn` 公开图片地址 |
| `GET /meta/qq-music-raw/*` | 本期未实现，返回 `{code:-1}` | 前端自动降级，**不影响解密** |

- 只被前端 `qmc.ts` / `qmc_oj.ts` / `musicex.ts` 三个 QQ 系模块调用；网易 NCM、酷狗 KGG、咪咕等不碰它。
- 当前线上地址：`https://unmusic-cover-proxy.xianshenghu363.workers.dev`

## 二、文件结构

```
cover-worker/
├── src/index.js          # Worker 主逻辑
├── wrangler.toml         # 部署配置（name / main / compatibility_date）
└── README.md             # 本文件
```

## 三、本地手动部署 / 更新（临时改代码用）

前置：本机已装 Node（≥16.17，本项目 Node 24 可用）。

```bash
cd source/cover-worker
npx wrangler login        # 首次：浏览器授权 Cloudflare 账号（一次性）
npx wrangler deploy       # 部署 / 更新（改完 index.js 后重跑这条即可）
```

部署成功终端会输出：

```
https://unmusic-cover-proxy.<你的子域>.workers.dev
```

> ⚠️ 只有**改了本目录的代码**才需要重新 `deploy`；改前端业务代码不需要碰 Worker。

## 四、托管 GitHub + 自动部署（极简，推荐）

**不需要手写任何配置文件，也不需要配 Token / Secret。**

### 1. 把代码推到 GitHub
`cover-worker/` 已经是 `source/` 仓库的子目录。正常 `git add cover-worker && commit && push` 即可（目前是未跟踪状态）。

### 2. 在 Cloudflare 控制台连你的 GitHub 仓库
1. 登录 Cloudflare 控制台 → **Workers & Pages** → **Create** → 选 **Connect to Git**（注意：不是创建空白 Worker）。
2. 授权连接你的 GitHub 账号，选中 `unmusic` 这个仓库。
3. 设置：
   - **生产分支**：`main`
   - **根目录**：填 `cover-worker`（Worker 代码在这个子目录里，已含 `wrangler.toml`）
4. 确认创建。

完成后，Cloudflare 会**自动监听你仓库的 push**——只要 `cover-worker/` 有改动，就自动 `wrangler deploy`。不用手动登录、不用配密钥，认证由 Cloudflare 的 GitHub 集成自动处理。

### 以后怎么更新 Worker
1. 本地改 `cover-worker/src/index.js`
2. `git add cover-worker && git commit && git push`
3. Cloudflare 自动部署，完事。

## 五、前端如何对接

`source/src/utils/api.ts` 第 1 行：

```ts
export const IXAREA_API_ENDPOINT = 'https://unmusic-cover-proxy.xianshenghu363.workers.dev';
```

改完前端需重新 `npm run build` 并发布 `dist/`（Worker 地址已写死，build 自动编入）。

## 六、常见问题

- **封面取不到**：先用浏览器 / `curl` 直接访问 Worker 地址验证两个端点是否返回 200；Worker 依赖 QQ 公开接口，若腾讯调整老接口可能需要改 `index.js`。
- **`*.workers.dev` 在国内访问慢**：可给 Worker 绑定自己的自定义域，或改用 Cloudflare Pages Functions 同源部署（彻底无 CORS）。
- **本地强刷才生效**：前端是 PWA，旧 Service Worker 会缓存 JS；验证时记得 Ctrl+Shift+R 或开无痕窗口。
