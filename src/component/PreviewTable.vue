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
          :icon="isRowPlaying(scope.row) ? VideoPause : VideoPlay"
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
import { VideoPlay, VideoPause, Download, Edit, Delete } from '@element-plus/icons-vue';
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
/* 操作列图标放大（合法盒增长，不被 .cell 裁剪） */
.ops-btn :deep(.el-icon) {
  font-size: 18px;
}
/* 播放/暂停按钮图标再突出一点 */
.play-pause-btn :deep(.el-icon) {
  font-size: 24px;
}

/* ===== 手机端表格适配 ===== */
@media (max-width: 768px) {
  /* 隐藏歌手/专辑列（信息不丢，show-overflow-tooltip 已有），保留封面+歌曲+操作 */
  .artist-col,
  .album-col {
    display: none;
  }
  /* 封面缩小 */
  .cover-col :deep(.el-image) {
    width: 60px !important;
    height: 60px !important;
  }
  /* 操作按钮：用 CSS 覆盖 size="large" 写死的 40px 盒子，缩到手机可容纳尺寸；
     盒子尺寸 >= 图标尺寸，不会被上下切割。桌面端(size="large" 40px)不受影响。 */
  .play-pause-btn {
    width: 32px !important;
    height: 32px !important;
    padding: 0 !important;
  }
  .ops-btn {
    width: 28px !important;
    height: 28px !important;
    padding: 0 !important;
  }
  /* 图标字号沿用 base 的 24/18px，手机与电脑完全一致；仅上面缩小了按钮盒子 */
}
@media (max-width: 480px) {
  /* 更小屏封面再缩 */
  .cover-col :deep(.el-image) {
    width: 48px !important;
    height: 48px !important;
  }
}
</style>
