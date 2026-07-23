// Cloudflare Worker: unmusic-cover-proxy
// 替代已停服的 um-api.ixarea.com，本期「仅实现封面」相关端点。
// 数据源: QQ 音乐公开搜索接口 + gtimg CDN 封面(均无需登录/签名)。
// 前端只需把 IXAREA_API_ENDPOINT 指向本 Worker 地址即可，其余代码不动。

const QQ_REFERER = 'https://y.qq.com/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

const jsonHeaders = (extra = {}) =>
  ({ 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra });

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ---- 1) 封面直构: /music/qq-cover/{type}/{pmid} ----
    // 直接代理 gtimg 公开 CDN 并补 CORS 头，pmid 来自文件内嵌或搜索结果。
    const direct = url.pathname.match(/^\/music\/qq-cover\/(\d+)\/(.+)$/);
    if (direct) {
      const type = direct[1];
      const pmid = direct[2];
      const sizeMap = { '1': '300x300', '2': '500x500', '3': '800x800' };
      const size = sizeMap[type] || '300x300';
      const coverUrl = `https://y.gtimg.cn/music/photo_new/T002R${size}M000${pmid}.jpg`;
      try {
        const upstream = await fetch(coverUrl, {
          headers: { Referer: QQ_REFERER, 'User-Agent': UA },
        });
        if (!upstream.ok) {
          return new Response('cover not found', { status: 404, headers: CORS });
        }
        return new Response(upstream.body, {
          status: 200,
          headers: {
            ...CORS,
            'Content-Type': upstream.headers.get('Content-Type') || 'image/jpeg',
            'Cache-Control': 'public, max-age=86400',
          },
        });
      } catch (e) {
        return new Response('upstream error: ' + e.message, { status: 502, headers: CORS });
      }
    }

    // ---- 2) 按歌名/歌手/专辑搜索 albummid: /music/qq-cover?Title&Artist&Album ----
    // 仅封面链路需要; 返回原 um-api 同款 {Id, Type} 格式, 前端无需改动。
    if (url.pathname === '/music/qq-cover') {
      const title = url.searchParams.get('Title') || '';
      const artist = url.searchParams.get('Artist') || '';
      const album = url.searchParams.get('Album') || '';
      const kw = `${title} ${artist}`.trim() || album;
      if (!kw) {
        return new Response(JSON.stringify({ Id: '', Type: 0 }), { status: 200, headers: jsonHeaders() });
      }
      try {
        const api =
          'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?ct=24&qqmusic_ver=1298&p=1&n=1&w=' +
          encodeURIComponent(kw) + '&format=json';
        const upstream = await fetch(api, {
          headers: { Referer: QQ_REFERER, 'User-Agent': UA },
        });
        const data = await upstream.json();
        const song = data?.data?.song?.list?.[0];
        const pmid = song?.albummid || '';
        return new Response(JSON.stringify({ Id: pmid, Type: 1 }), { status: 200, headers: jsonHeaders() });
      } catch (e) {
        // 搜索失败也返回空 Id, 前端会优雅降级(无封面), 不抛错。
        return new Response(JSON.stringify({ Id: '', Type: 0 }), { status: 200, headers: jsonHeaders() });
      }
    }

    // ---- 3) 元数据端点(本期未实现): 友好返回让前端优雅降级 ----
    // 前端 fetchMetadataFromSongId -> querySongInfoById 会收到 code=-1 走 throw 分支,
    // 上层已 catch 回退本地元数据, 不影响解密。
    if (url.pathname.startsWith('/meta/qq-music-raw/')) {
      return new Response(JSON.stringify({ code: -1, req_1: { code: -1 } }), {
        status: 200,
        headers: jsonHeaders(),
      });
    }

    return new Response('not found', { status: 404, headers: CORS });
  },
};
