<template>
  <div>
    <file-selector @error="showFail" @success="showSuccess" />

    <div id="app-control">
      <el-row class="mb-3">
        <span>歌曲命名格式：</span>
        <el-radio v-for="k in FilenamePolicies" :key="k.key" v-model="filename_policy" :label="k.key">
          {{ k.text }}
        </el-radio>
      </el-row>
      <el-row>
        <edit-dialog
          :show="showEditDialog"
          :picture="editing_data.picture"
          :title="editing_data.title"
          :artist="editing_data.artist"
          :album="editing_data.album"
          :albumartist="editing_data.albumartist"
          :genre="editing_data.genre"
          @cancel="showEditDialog = false" @ok="handleEdit"></edit-dialog>
        <config-dialog :show="showConfigDialog" @done="showConfigDialog = false"></config-dialog>
        <el-tooltip class="item" effect="dark" placement="top">
          <template #content>
            <span> 部分解密方案需要设定解密参数。 </span>
          </template>
          <el-button plain @click="showConfigDialog = true">
            <el-icon><Tools /></el-icon>解密设定
          </el-button>
        </el-tooltip>
        <el-button plain @click="handleDownloadAll" :disabled="instant_save" title="立即保存模式已自动写入磁盘，无需再下载全部">
          <el-icon><Download /></el-icon>下载全部
        </el-button>
        <el-button plain type="danger" @click="handleDeleteAll">
          <el-icon><Delete /></el-icon>清除全部
        </el-button>

        <el-tooltip class="item" effect="dark" placement="top-start">
          <template #content>
            <span v-if="instant_save">工作模式: {{ (instant_save && dir) ? '写入本地文件系统' : '调用浏览器下载' }}</span>
            <span v-else>
              当您使用此工具进行大量文件解锁的时候，建议开启此选项。<br />
              开启后，解锁结果将不会存留于浏览器中，防止内存不足。
            </span>
          </template>
            <el-checkbox v-model="instant_save" type="success" border class="ml-2">立即保存</el-checkbox>
        </el-tooltip>
      </el-row>
    </div>

    <div class="player-bar">
      <div v-if="playing_row" class="now-playing">
        正在播放：{{ playing_row.title }}<template v-if="playing_row.artist"> - {{ playing_row.artist }}</template>
      </div>
      <audio
        ref="audioRef"
        @play="is_playing = true"
        @pause="is_playing = false"
        @ended="onPlayEnded"
        @timeupdate="onTimeUpdate"
        @loadedmetadata="onLoadedMeta"
      />
      <div class="player-controls">
        <button
          class="play-btn"
          :disabled="!playing_row"
          :title="is_playing ? '暂停' : '播放'"
          @click="togglePlay"
        >
          <component :is="is_playing ? VideoPause : VideoPlay" />
        </button>
        <span class="time">{{ fmtTime(progress) }}</span>
        <el-slider
          v-model="progress"
          class="progress-slider"
          :max="duration || 0.1"
          :step="0.1"
          :show-tooltip="false"
          :disabled="!playing_row"
          @input="onSeekInput"
          @change="onSeekChange"
        />
        <span class="time">{{ fmtTime(duration) }}</span>
        <button
          class="vol-icon"
          :class="{ muted: volume === 0 }"
          :title="volume === 0 ? '取消静音（点击恢复）' : '音量 ' + volume + '%（点击静音）'"
          @click="toggleMute"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            <path class="vol-wave" d="M16 8.5a4 4 0 010 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            <g class="vol-slash">
              <line x1="16" y1="9" x2="21" y2="14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              <line x1="21" y1="9" x2="16" y2="14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </g>
          </svg>
        </button>
        <el-slider v-model="volume" class="volume-slider" :min="0" :max="100" :step="1" :show-tooltip="false" />
      </div>
    </div>

    <PreviewTable :policy="filename_policy" :table-data="tableData" :instant-save="instant_save" :playing-row="playing_row" :is-playing="is_playing" @download="saveFile" @edit="editFile" @play="changePlaying" @delete="onRowDelete" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { Tools, Download, Delete, VideoPlay, VideoPause } from '@element-plus/icons-vue';
import FileSelector from '@/component/FileSelector.vue';
import PreviewTable from '@/component/PreviewTable.vue';
import ConfigDialog from '@/component/ConfigDialog.vue';
import EditDialog from '@/component/EditDialog.vue';

import { DownloadBlobMusic, FilenamePolicy, FilenamePolicies, RemoveBlobMusic, DirectlyWriteFile } from '@/utils/utils';
import { GetImageFromURL, RewriteMetaToMp3, RewriteMetaToFlac, AudioMimeType, split_regex } from '@/decrypt/utils';
import { parseBlob as metaParseBlob } from 'music-metadata-browser';
import { DecryptResult } from '@/decrypt/entity';
import { FileSystemDirectoryHandle } from '@/shims-fs';

interface EditDialogOkData {
  picture?: Blob;
  title: string;
  artist: string;
  album: string;
  albumartist: string;
  genre: string;
}

// editing_data is always fully populated (initialized with empty strings); unlike DecryptResult,
// its tag fields are required strings so the EditDialog template bindings type-check.
interface EditData {
  picture: string;
  title: string;
  artist: string;
  album: string;
  albumartist: string;
  genre: string;
  file: string;
  blob: Blob;
  ext: string;
  mime: string;
  rawExt?: string;
  rawFilename?: string;
  message?: string;
}

export default defineComponent({
  name: 'Home',
  components: {
    FileSelector,
    PreviewTable,
    ConfigDialog,
    EditDialog,
    Tools,
    Download,
    Delete,
  },
  setup() {
    // 图标以 <component :is> 绑定用，需暴露到模板作用域
    return { VideoPlay, VideoPause };
  },
  data() {
    return {
      showConfigDialog: false,
      showEditDialog: false,
      editing_data: {
        picture: '', title: '', artist: '', album: '', albumartist: '', genre: '',
        file: '', blob: new Blob(), ext: '', mime: '',
      } as EditData,
      tableData: [] as DecryptResult[],
      playing_row: null as DecryptResult | null, // 当前曲目（按对象引用，表格 splice 后仍能追踪）
      is_playing: false, // 音频真实播放状态（由 audio 事件驱动）
      play_token: 0, // 切歌令牌：每次切歌自增，防止旧的 play() 异步回调覆盖新状态
      progress: 0, // 播放进度（秒）
      duration: 0, // 总时长（秒）
      volume: 100, // 音量 0-100
      prev_volume: 100, // 静音前音量，toggleMute 时恢复用
      seek_hold: 0, // 拖动进度条时间戳：拖动期间 timeupdate 不回写进度，避免滑块抖动
      filename_policy: FilenamePolicy.ArtistAndTitle,
      instant_save: false,
      FilenamePolicies,
      dir: null as FileSystemDirectoryHandle | null,
    };
  },
  watch: {
    volume(v: number) {
      const audio = this.$refs.audioRef as HTMLAudioElement | undefined;
      if (audio) audio.volume = v / 100;
    },
    instant_save(val) {
      if (val) {
        this.showDirectlySave();
      } else {
        // 关闭“立即保存”时清掉已选文件夹，避免后续下载仍偷偷写入旧目录
        this.dir = null;
      }
    },
  },
  methods: {
    async showSuccess(data: DecryptResult) {
      // 两种模式都把信息推入表格，保证首页有预览（立即保存也不再“解锁成功却看不见”）
      this.tableData.push(data);
      if (this.instant_save) {
        // 立即保存：写盘 + 仅弹“保存成功”（saveFile 内部已通知），避免与解锁通知重复
        await this.saveFile(data);
      } else {
        this.$notify.success({
          title: '解锁成功',
          message: '成功解锁 ' + data.title,
          duration: 3000,
        });
      }
      if (import.meta.env.PROD && window._paq) {
        let _rp_data = [data.title, data.artist, data.album];
        window._paq.push(['trackEvent', 'Unlock', data.rawExt + ',' + data.mime, JSON.stringify(_rp_data)]);
      }
    },
    showFail(errInfo: unknown, filename: string) {
      console.error(errInfo, filename);
      this.$notify.error({
        title: '出现问题',
        message:
          String(errInfo) +
          '，' +
          filename +
          '，参考<a target="_blank" href="https://github.com/ix64/unlock-music/wiki/使用提示">使用提示</a>',
        dangerouslyUseHTMLString: true,
        duration: 6000,
      });
      if (import.meta.env.PROD && window._paq) {
        window._paq.push(['trackEvent', 'Error', String(errInfo), filename]);
      }
    },
    async changePlaying(row: DecryptResult) {
      const audio = this.$refs.audioRef as HTMLAudioElement | undefined;
      if (!audio) return;

      // 再次点击当前正在播放的曲目 = 暂停/继续切换，无需重新加载
      if (this.playing_row === row) {
        if (audio.paused) {
          // 播完(ended)后再次点击：先把进度归零再播放，否则部分浏览器不会从头重播
          if (audio.ended) audio.currentTime = 0;
          try {
            await audio.play();
          } catch (e) {
            /* AbortError 等忽略 */
          }
        } else {
          audio.pause();
        }
        return;
      }

      // 切换到新曲目：令牌自增，标记这次切换
      const token = ++this.play_token;
      this.playing_row = row;
      this.progress = 0;
      this.duration = 0;

      // 关键：先暂停旧曲目并显式 load()，让浏览器释放上一首的解码资源，
      // 避免直接替换 src 时的同步重解析卡顿 + 旧 play() 抛 AbortError
      audio.pause();
      audio.src = row.file;
      audio.load();

      try {
        await audio.play();
      } catch (e) {
        // 切歌打断(AbortError)或旧回调已过期(token 变化)属正常，忽略；
        // 其余播放失败仅记日志、不弹窗（与线上 a46c048 原生 audio 行为一致）
        if (token !== this.play_token) return;
        if ((e as DOMException)?.name === 'AbortError') return;
        console.warn('播放失败', e);
      }
    },
    toggleMute() {
      // 点击音量图标：在静音 / 恢复之间切换，避免用户找不到静音入口
      if (this.volume > 0) {
        this.prev_volume = this.volume;
        this.volume = 0;
      } else {
        this.volume = this.prev_volume || 100;
      }
    },
    togglePlay() {
      // 播放条主按钮：对当前曲目做播放/暂停切换
      if (this.playing_row) this.changePlaying(this.playing_row);
    },
    onTimeUpdate() {
      const audio = this.$refs.audioRef as HTMLAudioElement | undefined;
      if (!audio) return;
      // 拖动进度条期间不回写，避免滑块被 timeupdate 拽回去
      if (Date.now() - this.seek_hold < 400) return;
      this.progress = audio.currentTime || 0;
    },
    onLoadedMeta() {
      const audio = this.$refs.audioRef as HTMLAudioElement | undefined;
      if (!audio) return;
      this.duration = isFinite(audio.duration) ? audio.duration : 0;
      audio.volume = this.volume / 100; // 新元素/新源时同步音量
    },
    onSeekInput() {
      this.seek_hold = Date.now();
    },
    onSeekChange(val: number) {
      const audio = this.$refs.audioRef as HTMLAudioElement | undefined;
      if (audio && this.playing_row) {
        audio.currentTime = val; // 设到 < 时长会自动清除 ended 状态，已播完也能拖动
      }
      this.progress = val; // 立即回写，暂停/播完状态下拖动也能即时看到滑块移动
      this.seek_hold = 0;
    },
    fmtTime(s: number): string {
      if (!isFinite(s) || s < 0) s = 0;
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, '0')}`;
    },
    onPlayEnded() {
      // 播完当前曲目即停住，不自动连播下一首；进度停在末尾，可点播放键从头重播
      this.is_playing = false;
    },
    onRowDelete(row: DecryptResult) {
      // 删除的正是当前曲目：先停播并清空 src，避免播放条继续指向已撤销的 blob
      if (this.playing_row === row) {
        const audio = this.$refs.audioRef as HTMLAudioElement | undefined;
        if (audio) {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        }
        this.playing_row = null;
        this.is_playing = false;
        this.progress = 0;
        this.duration = 0;
      }
    },
    handleDeleteAll() {
      // 清除全部前先停播，避免播放条悬空指向已撤销的 blob
      const audio = this.$refs.audioRef as HTMLAudioElement | undefined;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      this.playing_row = null;
      this.is_playing = false;
      this.progress = 0;
      this.duration = 0;
      this.tableData.forEach((value) => {
        RemoveBlobMusic(value);
      });
      this.tableData = [];
    },
    handleDecryptionConfig() {
      this.showConfigDialog = true;
    },
    async handleDownloadAll() {
      // 顺序逐个保存，避免“立即保存”下大量写盘并发堆积（每条之间让出事件循环）
      for (let i = 0; i < this.tableData.length; i++) {
        await this.saveFile(this.tableData[i]);
        await new Promise((r) => setTimeout(r, 120));
      }
    },
    async handleEdit(data: EditDialogOkData) {
      this.showEditDialog = false;
      URL.revokeObjectURL(this.editing_data.file);
      if (data.picture) {
        URL.revokeObjectURL(this.editing_data.picture);
        this.editing_data.picture = URL.createObjectURL(data.picture);
      }
      this.editing_data.title = data.title;
      this.editing_data.artist = data.artist;
      this.editing_data.album = data.album;
      let writeSuccess: boolean | undefined = true;
      let notifyMsg = '成功修改 ' + this.editing_data.title;
      try {
        const musicMeta = await metaParseBlob(new Blob([this.editing_data.blob], { type: this.editing_data.mime }));
        let imageInfo = undefined;
        if (this.editing_data.picture !== '') {
          imageInfo = await GetImageFromURL(this.editing_data.picture);
          if (!imageInfo) {
            console.warn('获取图像失败', this.editing_data.picture);
          }
        }
        const newMeta = { picture: imageInfo?.buffer,
          title: data.title,
          artists: data.artist.split(split_regex),
          album: data.album,
          albumartist: data.albumartist,
          genre: data.genre.split(split_regex)
        };
        const buffer = Buffer.from(await this.editing_data.blob.arrayBuffer());
        const mime = AudioMimeType[this.editing_data.ext] || AudioMimeType.mp3;
        if (this.editing_data.ext === 'mp3') {
          this.editing_data.blob = new Blob([RewriteMetaToMp3(buffer, newMeta, musicMeta) as BlobPart], { type: mime });
        } else if (this.editing_data.ext === 'flac') {
          this.editing_data.blob = new Blob([RewriteMetaToFlac(buffer, newMeta, musicMeta) as BlobPart], { type: mime });
        } else {
          writeSuccess = undefined;
          notifyMsg = this.editing_data.ext + '类型文件暂时不支持修改音乐标签';
        }
      } catch (e) {
        writeSuccess = false;
        notifyMsg = '修改' + this.editing_data.title + '未能完成。在写入新的元数据时发生错误：' + e;
      }
      this.editing_data.file = URL.createObjectURL(this.editing_data.blob);
      if (writeSuccess === true) {
        this.$notify.success({
          title: '修改成功',
          message: notifyMsg,
          duration: 3000,
        });
      } else if (writeSuccess === false) {
        this.$notify.error({
          title: '修改失败',
          message: notifyMsg,
          duration: 3000,
        });
      } else {
        this.$notify.warning({
          title: '修改取消',
          message: notifyMsg,
          duration: 3000,
        });
      }
    },

    async editFile(data: DecryptResult) {
      this.editing_data = data as EditData;
      const musicMeta = await metaParseBlob(this.editing_data.blob);
      this.editing_data.albumartist = musicMeta.common.albumartist || '';
      this.editing_data.genre = musicMeta.common.genre?.toString() || '';
      this.showEditDialog = true;
    },
    async saveFile(data: DecryptResult) {
      // 必须以“立即保存”开关为准：仅当开关开启且已选目录才写磁盘，
      // 否则一律走浏览器下载（解决取消选文件夹后 / 关掉开关后仍写入旧目录的问题）
      if (this.instant_save && this.dir) {
        await DirectlyWriteFile(data, this.filename_policy, this.dir);
        this.$notify({
          title: '保存成功',
          message: data.title,
          position: 'top-left',
          type: 'success',
          duration: 3000,
        });
      } else {
        DownloadBlobMusic(data, this.filename_policy);
      }
    },
    async showDirectlySave() {
      if (!window.showDirectoryPicker) {
        // 浏览器不支持直接写盘：直接退回浏览器下载模式，避免开关开着却无目录可用
        this.instant_save = false;
        this.dir = null;
        this.$notify.warning('当前浏览器不支持直接保存到磁盘，已切换为浏览器下载');
        return;
      }
      try {
        await this.$confirm('您的浏览器支持文件直接保存到磁盘，是否使用？', '新特性提示', {
          confirmButtonText: '使用',
          cancelButtonText: '不使用',
          type: 'warning',
          center: true,
        });
      } catch (e) {
        // 用户选择“不使用”或关闭弹窗：明确退回浏览器下载模式
        this.instant_save = false;
        this.dir = null;
        return;
      }
      try {
        const dir = await window.showDirectoryPicker();
        this.dir = dir;
        const test_filename = '__unlock_music_write_test.txt';
        await dir.getFileHandle(test_filename, { create: true });
        await dir.removeEntry(test_filename);
      } catch (e) {
        // 用户取消选择文件夹：回退为浏览器下载，而不是保留旧的/空的目录状态
        console.error(e);
        this.instant_save = false;
        this.dir = null;
        this.$notify.info('未选择保存文件夹，将继续使用浏览器下载');
      }
    },
  },
});
</script>

<style scoped>
.player-bar {
  margin: 0 auto 15px;
  max-width: 720px; /* 播放条居中、宽度收住，不再全宽铺满 */
}
.now-playing {
  font-size: 13px;
  color: #67c23a;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}
.player-bar audio {
  display: none; /* 原生控件已由自定义播放条替代 */
}
.player-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}
.progress-slider {
  flex: 1;
  min-width: 120px;
}
.volume-slider {
  width: 90px;
  flex: none;
}
.time {
  font-size: 14px;
  color: #606266;
  min-width: 42px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
/* 播放/暂停按钮：原生 <button> + <el-icon>，避免 el-button 默认白底观感；
   仿 chrome 原生 audio 控件的播放键（圆底 + 深色图标，hover 浅高亮） */
.player-controls .play-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #303133;
  font-size: 22px;
  cursor: pointer;
  transition: background-color 0.15s;
}
.player-controls .play-btn:hover:not(:disabled) {
  background-color: rgba(0, 0, 0, 0.06);
}
.player-controls .play-btn:active:not(:disabled) {
  background-color: rgba(0, 0, 0, 0.1);
}
.player-controls .play-btn:focus-visible {
  outline: 2px solid rgba(64, 158, 255, 0.5);
  outline-offset: 2px;
}
.player-controls .play-btn:disabled {
  color: #c0c4cc;
  cursor: not-allowed;
}
/* 音量图标按钮：与播放键同风格（透明圆 + hover 浅高亮），点击切换静音 */
.player-controls .vol-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #303133;
  cursor: pointer;
  transition: background-color 0.15s;
}
.player-controls .vol-icon:hover {
  background-color: rgba(0, 0, 0, 0.06);
}
.player-controls .vol-icon:active {
  background-color: rgba(0, 0, 0, 0.1);
}
.player-controls .vol-icon:focus-visible {
  outline: 2px solid rgba(64, 158, 255, 0.5);
  outline-offset: 2px;
}
/* 静音态：隐藏声波弧、显示斜杠 */
.player-controls .vol-icon .vol-slash {
  display: none;
}
.player-controls .vol-icon.muted .vol-wave {
  display: none;
}
.player-controls .vol-icon.muted .vol-slash {
  display: block;
}
/* 滑块小球：纯蓝实心、去掉白边与外围留白（亮暗通用，留组件内即可） */
.progress-slider :deep(.el-slider__button),
.volume-slider :deep(.el-slider__button) {
  background-color: #409eff;
  border: none;
  box-shadow: none;
}

/* ===== 手机端播放条适配 ===== */
@media (max-width: 768px) {
  .player-bar {
    max-width: 100%;
    margin-bottom: 10px;
  }
  .player-controls {
    flex-wrap: wrap;
    gap: 6px;
  }
  .now-playing {
    font-size: 12px;
    margin-bottom: 6px;
  }
  /* 窄屏隐藏音量滑块（保留静音按钮点按切换），进度条撑满 */
  .volume-slider {
    display: none;
  }
  .time {
    font-size: 12px;
    min-width: 36px;
  }
  .progress-slider {
    min-width: 80px;
  }
}
@media (max-width: 480px) {
  .player-controls .play-btn {
    width: 32px;
    height: 32px;
    font-size: 18px;
  }
  .player-controls .vol-icon {
    width: 28px;
    height: 28px;
  }
  .time {
    font-size: 11px;
    min-width: 32px;
  }
}
</style>
