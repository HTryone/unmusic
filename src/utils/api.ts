export const IXAREA_API_ENDPOINT = 'https://um-api.ixarea.com';

export interface UpdateInfo {
  Found: boolean;
  HttpsFound: boolean;
  Version: string;
  URL: string;
  Detail: string;
}

export async function checkUpdate(version: string): Promise<UpdateInfo | null> {
  try {
    const resp = await fetch(IXAREA_API_ENDPOINT + '/music/app-version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Version: version }),
    });
    return await resp.json();
  } catch {
    // 版本检查为纯信息性请求，跨域/离线环境下必然失败（um-api.ixarea.com
    // 不返回 CORS 头）。失败属预期，静默返回 null，由调用方走"离线使用"分支，
    // 避免控制台出现红色 TypeError 堆栈。
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
