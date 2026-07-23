<template>
  <el-table :data="tableData" style="width: 100%">
    <el-table-column label="封面">
      <template #default="scope">
        <el-image :src="scope.row.picture" style="width: 100px; height: 100px">
          <template #error>
            <div class="image-slot el-image__error">暂无封面</div>
          </template>
        </el-image>
      </template>
    </el-table-column>
    <el-table-column label="歌曲" show-overflow-tooltip>
      <template #default="scope">
        <span>{{ scope.row.title }}</span>
      </template>
    </el-table-column>
    <el-table-column label="歌手" show-overflow-tooltip>
      <template #default="scope">
        <p>{{ scope.row.artist }}</p>
      </template>
    </el-table-column>
    <el-table-column label="专辑" show-overflow-tooltip>
      <template #default="scope">
        <p>{{ scope.row.album }}</p>
      </template>
    </el-table-column>
    <el-table-column label="操作">
      <template #default="scope">
        <el-button
          :icon="isRowPlaying(scope.row) ? VideoPause : VideoPlay"
          circle
          :type="scope.row === props.playingRow ? 'primary' : 'success'"
          :title="isRowPlaying(scope.row) ? '暂停' : '播放'"
          @click="handlePlay(scope.$index, scope.row)" />
        <el-button :icon="Download" circle :disabled="props.instantSave" title="立即保存模式已自动写入磁盘，无需再下载" @click="handleDownload(scope.row)" />
        <el-button :icon="Edit" circle @click="handleEdit(scope.row)" />
        <el-button :icon="Delete" circle type="danger" @click="handleDelete(scope.$index, scope.row)" />
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

<style scoped></style>
