<template>
  <el-table :data="tableData" style="width: 100%">
    <el-table-column label="封面" class-name="cover-col">
      <template #default="scope">
        <el-image :src="scope.row.picture" style="width: 100px; height: 100px">
          <template #error>
            <div class="image-slot el-image__error">暂无封面</div>
          </template>
        </el-image>
      </template>
    </el-table-column>
    <el-table-column label="歌曲" show-overflow-tooltip class-name="title-col">
      <template #default="scope">
        <span>{{ scope.row.title }}</span>
      </template>
    </el-table-column>
    <el-table-column label="歌手" show-overflow-tooltip class-name="artist-col">
      <template #default="scope">
        <p>{{ scope.row.artist }}</p>
      </template>
    </el-table-column>
    <el-table-column label="专辑" show-overflow-tooltip class-name="album-col">
      <template #default="scope">
        <p>{{ scope.row.album }}</p>
      </template>
    </el-table-column>
    <el-table-column label="操作">
      <template #default="scope">
        <el-button
          class="play-pause-btn"
          size="large"
          :icon="isRowPlaying(scope.row) ? PauseIcon : PlayIcon"
          circle
          :type="scope.row === props.playingRow ? 'primary' : 'success'"
          :title="isRowPlaying(scope.row) ? '暂停' : '播放'"
          @click="handlePlay(scope.$index, scope.row)" />
        <el-button class="ops-btn" size="large" :icon="Download" circle :disabled="props.instantSave" title="立即保存模式已自动写入磁盘，无需再下载" @click="handleDownload(scope.row)" />
        <el-button class="ops-btn" size="large" :icon="Edit" circle @click="handleEdit(scope.row)" />
        <el-button class="ops-btn" size="large" :icon="Delete" circle type="danger" @click="handleDelete(scope.$index, scope.row)" />
      </template>
    </el-table-column>
  </el-table>
</template>

<script lang="ts" setup>
import { h } from 'vue';
import { Download, Edit, Delete } from '@element-plus/icons-vue';

// 自定义播放/暂停图标：复用播放器(EP VideoPlay/VideoPause)的三角/双条真实形状，
// 但去掉外圈圆环(圆环是 icon 自带 path 的前两段圆形子路径)，避免绿/蓝按钮上出现白色描边圈。
const PlayIcon = {
  render: () => h('svg', { viewBox: '0 0 1024 1024', xmlns: 'http://www.w3.org/2000/svg' },
    h('path', { fill: 'currentColor', d: 'M444 660L688 512 444 364zm12-350 260 173.333a48 48 0 0 1 0 79.872L456 736.205A48 48 0 0 1 384 696.269V327.731a48 48 0 0 1 72-41.398z' })),
};
const PauseIcon = {
  render: () => h('svg', { viewBox: '0 0 1024 1024', xmlns: 'http://www.w3.org/2000/svg' },
    h('path', { fill: 'currentColor', d: 'M408 264q36 0 36 36v424q0 36-36 36t-36-36V300q0-36 36-36m200 0q36 0 36 36v424q0 36-36 36t-36-36V300q0-36 36-36' })),
};

import { RemoveBlobMusic } from '@/utils/utils';

const props = defineProps<{
  tableData: Array<any>;
  policy: number;
  instantSave: boolean;
  playingRow?: any;
  isPlaying?: boolean;
}>();

const emit = defineEmits<{
  play: [row: any];
  download: [row: any];
  edit: [row: any];
  delete: [row: any];
}>();

// 仅当「这一行正是当前曲目」且「正在播放」时才显示暂停图标
function isRowPlaying(row: any): boolean {
  return row === props.playingRow && !!props.isPlaying;
}

function handlePlay(index: number, row: any) {
  emit('play', row);
}
function handleDelete(index: number, row: any) {
  // 先通知父级（若删的是正在播放的曲目，父级会先暂停并清空 src），再撤销 blob、移除行
  emit('delete', row);
  RemoveBlobMusic(row);
  props.tableData.splice(index, 1);
}
function handleDownload(row: any) {
  emit('download', row);
}
function handleEdit(row: any) {
  emit('edit', row);
}
</script>

<style scoped>
/* ===== 手机端表格适配 ===== */
/* 按钮图标放大(播放24px / 操作18px)已移至全局 src/scss/_table-override.scss（!important 兜底，确保手机端命中） */
@media (max-width: 768px) {
  /* 隐藏歌手/专辑列（信息不丢，show-overflow-tooltip 已有），保留封面+歌曲+操作 */
  .artist-col,
  .album-col {
    display: none;
  }
}
</style>
