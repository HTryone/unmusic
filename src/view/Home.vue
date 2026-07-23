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

    <audio :autoplay="playing_auto" :src="playing_url" controls />

    <PreviewTable :policy="filename_policy" :table-data="tableData" :instant-save="instant_save" @download="saveFile" @edit="editFile" @play="changePlaying" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { Tools, Download, Delete } from '@element-plus/icons-vue';
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
  data() {
    return {
      showConfigDialog: false,
      showEditDialog: false,
      editing_data: {
        picture: '', title: '', artist: '', album: '', albumartist: '', genre: '',
        file: '', blob: new Blob(), ext: '', mime: '',
      } as EditData,
      tableData: [] as DecryptResult[],
      playing_url: '',
      playing_auto: false,
      filename_policy: FilenamePolicy.ArtistAndTitle,
      instant_save: false,
      FilenamePolicies,
      dir: null as FileSystemDirectoryHandle | null,
    };
  },
  watch: {
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
    changePlaying(url: string) {
      this.playing_url = url;
      this.playing_auto = true;
    },
    handleDeleteAll() {
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
