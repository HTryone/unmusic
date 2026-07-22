// Cloudflare Worker：转发 QQ 音乐 API，绕开浏览器 CORS 限制
//
// 部署：Cloudflare Workers 新建一个 Worker，粘贴本文件，路由指向
//       *.workers.dev 或你的自定义域。无需任何绑定/变量。
//
// 前端用法：把请求发到本 Worker，路径保持 /cgi-bin/musicu.fcg，
//   并把 QQ 音乐 Cookie 放在 X-QQ-Cookie 请求头（浏览器禁止 JS 设置 Cookie 头，
//   故用自定义头，由本 Worker 转成真正的 Cookie 头再转发给 u.y.qq.com）。

const UPSTREAM = 'https://u.y.qq.com';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 处理 CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const target = UPSTREAM + url.pathname + url.search;

    const headers = new Headers(request.headers);
    // 前端用 X-QQ-Cookie 传 QQ 音乐 Cookie，这里转成上游需要的真实 Cookie 头
    const qqCookie = headers.get('X-QQ-Cookie');
    if (qqCookie) headers.set('Cookie', qqCookie);
    headers.delete('X-QQ-Cookie');
    // 让 fetch 自行设置目标主机头，避免把 Worker 的 host 带到上游
    headers.delete('host');
    headers.delete('origin');

    const init = {
      method: request.method,
      headers,
      redirect: 'follow',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
      // 流式转发请求体需显式声明 half-duplex
      init.duplex = 'half';
    }

    const resp = await fetch(target, init);

    const out = new Response(resp.body, resp);
    out.headers.set('Access-Control-Allow-Origin', '*');
    out.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    out.headers.set('Access-Control-Allow-Headers', '*');
    return out;
  },
};
