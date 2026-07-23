export const IXAREA_API_ENDPOINT = 'https://unmusic-cover-proxy.xianshenghu363.workers.dev';

// 本项目线上部署地址。版本检查改为读取自建的静态 version.json（发新版时
// 更新 public/version.json 即可），不再请求上游 um-api（其版本号体系与本
// fork 无关，且不返回 CORS 头必然失败）。
export const UM_SITE_ENDPOINT = 'https://unmusic-8ml.pages.dev';

export interface UpdateInfo {
  Found: boolean;
  HttpsFound: boolean;
  Version: string;
  URL: string;
  Detail: string;
}

interface RemoteVersionInfo {
  Version: string;
  Detail: string;
  URL: string;
}

// 比较形如 "F2.0.0" 的版本号：忽略前缀字母，逐段比较数字。
// 远端较新返回 true。
function isRemoteNewer(local: string, remote: string): boolean {
  const parse = (v: string) => (v.match(/\d+/g) ?? []).map(Number);
  const a = parse(local);
  const b = parse(remote);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (y > x) return true;
    if (y < x) return false;
  }
  return false;
}

export async function checkUpdate(version: string): Promise<UpdateInfo | null> {
  try {
    // 写绝对地址：线上/PWA 同源直读；发行版(localhost 等)也去线上取最新版本号。
    // no-store 防止 HTTP 缓存住旧的版本信息（SW 预缓存不含 json，无需担心）。
    const resp = await fetch(UM_SITE_ENDPOINT + '/version.json', { cache: 'no-store' });
    if (!resp.ok) return null;
    const remote: RemoteVersionInfo = await resp.json();
    if (!remote?.Version || !isRemoteNewer(version, remote.Version)) return null;
    return {
      Found: true,
      HttpsFound: true,
      Version: remote.Version,
      URL: remote.URL || UM_SITE_ENDPOINT,
      Detail: remote.Detail || '',
    };
  } catch {
    // 离线/网络异常属预期，静默返回 null，由调用方走"离线使用"分支。
    return null;
  }
}

export interface CoverInfo {
  Id: string;
  Type: number;
}

export async function queryAlbumCover(title: string, artist?: string, album?: string): Promise<CoverInfo> {
  const endpoint = IXAREA_API_ENDPOINT + '/music/qq-cover';
  const params = new URLSearchParams([
    ['Title', title],
    ['Artist', artist ?? ''],
    ['Album', album ?? ''],
  ]);
  const resp = await fetch(`${endpoint}?${params.toString()}`);
  return await resp.json();
}

export interface TrackInfo {
  id: number;
  type: number;
  mid: string;
  name: string;
  title: string;
  subtitle: string;
  singer: {
    id: number;
    mid: string;
    name: string;
    title: string;
    type: number;
    uin: number;
  }[];
  album: {
    id: number;
    mid: string;
    name: string;
    title: string;
    subtitle: string;
    time_public: string;
    pmid: string;
  };
  interval: number;
  index_cd: number;
  index_album: number;
}

export interface SongItemInfo {
  title: string;
  content: {
    value: string;
  }[];
}

export interface SongInfoResponse {
  info: {
    company: SongItemInfo;
    genre: SongItemInfo;
    intro: SongItemInfo;
    lan: SongItemInfo;
    pub_time: SongItemInfo;
  };
  extras: {
    name: string;
    transname: string;
    subtitle: string;
    from: string;
    wikiurl: string;
  };
  track_info: TrackInfo;
}

export interface RawQMBatchResponse<T> {
  code: number;
  ts: number;
  start_ts: number;
  traceid: string;
  req_1: {
    code: number;
    data: T;
  };
}

export async function querySongInfoById(id: string | number): Promise<SongInfoResponse> {
  const url = `${IXAREA_API_ENDPOINT}/meta/qq-music-raw/${id}`;
  const result: RawQMBatchResponse<SongInfoResponse> = await fetch(url).then((r) => r.json());
  if (result.code === 0 && result.req_1.code === 0) {
    return result.req_1.data;
  }

  throw new Error('请求信息失败');
}

export function getQMImageURLFromPMID(pmid: string, type = 1): string {
  return `${IXAREA_API_ENDPOINT}/music/qq-cover/${type}/${pmid}`;
}
