<style scoped lang="scss">
label {
  cursor: pointer;
  line-height: 1.2;
  display: block;
}
.item-desc {
  color: #aaa;
  font-size: small;
  display: block;
  line-height: 1.2;
  margin-top: 0.2em;
}
.item-desc a {
  color: #aaa;
}

form :deep(input) {
  font-family: 'Courier New', Courier, monospace;
}

:deep(.um-edit-dialog) {
  max-width: 90%;
  width: 30em;
}
// 窄屏下按视口宽度放宽对话框，避免内容区过窄
@media (max-width: 768px) {
  :deep(.um-edit-dialog) {
    width: 92vw;
    max-width: 92vw;
  }
}
@media (max-width: 480px) {
  :deep(.um-edit-dialog) {
    width: 96vw;
    max-width: 96vw;
  }
}

/* 暗色模式适配 */
@media (prefers-color-scheme: dark) {
  .item-desc {
    color: lighten(black, 60%);
  }
  .item-desc a {
    color: lighten(black, 55%);
  }
}
</style>

<template>
  <el-dialog v-model="visible" title="音乐标签编辑" class="um-edit-dialog" center>
    <el-form ref="form" status-icon :model="form" label-width="0">
      <section>
        <el-image v-show="!editPicture" :src="imgFile.url || picture" style="width: 100px; height: 100px">
          <template #error>
            <div class="image-slot el-image__error">暂无封面</div>
          </template>
        </el-image>
        <el-upload
          v-show="editPicture"
          :auto-upload="false"
          :on-change="addFile"
          :on-remove="rmvFile"
          :show-file-list="true"
          :limit="1"
          list-type="picture"
          action=""
          drag
        >
          <el-icon class="el-icon-upload"><Upload /></el-icon>
          <div class="el-upload__text">将新图片拖到此处，或<em>点击选择</em><br />以替换自动匹配的图片</div>
          <template #tip>
            <div class="el-upload__tip">新拖到此处的图片将覆盖原始图片</div>
          </template>
        </el-upload>
        <el-icon v-if="!editPicture" @click="changeCover"><Edit /></el-icon>
        <el-icon v-else @click="changeCover"><Check /></el-icon>
        <br />
        标题:
        <span v-show="!editTitle">{{ title }}</span>
        <el-input v-show="editTitle" v-model="title"></el-input>
        <el-icon v-if="!editTitle" @click="editTitle = !editTitle"><Edit /></el-icon>
        <el-icon v-else @click="editTitle = !editTitle"><Check /></el-icon>
        <br />
        艺术家:
        <span v-show="!editArtist">{{ artist }}</span>
        <el-input v-show="editArtist" v-model="artist"></el-input>
        <el-icon v-if="!editArtist" @click="editArtist = !editArtist"><Edit /></el-icon>
        <el-icon v-else @click="editArtist = !editArtist"><Check /></el-icon>
        <br />
        专辑:
        <span v-show="!editAlbum">{{ album }}</span>
        <el-input v-show="editAlbum" v-model="album"></el-input>
        <el-icon v-if="!editAlbum" @click="editAlbum = !editAlbum"><Edit /></el-icon>
        <el-icon v-else @click="editAlbum = !editAlbum"><Check /></el-icon>
        <br />
        专辑艺术家:
        <span v-show="!editAlbumartist">{{ albumartist }}</span>
        <el-input v-show="editAlbumartist" v-model="albumartist"></el-input>
        <el-icon v-if="!editAlbumartist" @click="editAlbumartist = !editAlbumartist"><Edit /></el-icon>
        <el-icon v-else @click="editAlbumartist = !editAlbumartist"><Check /></el-icon>
        <br />
        风格:
        <span v-show="!editGenre">{{ genre }}</span>
        <el-input v-show="editGenre" v-model="genre"></el-input>
        <el-icon v-if="!editGenre" @click="editGenre = !editGenre"><Edit /></el-icon>
        <el-icon v-else @click="editGenre = !editGenre"><Check /></el-icon>
        <br />

        <p class="item-desc">
          为了节省您设备的资源，请在确定前充分检查，避免反复修改。<br />
          直接关闭此对话框不会保留所作的更改。
        </p>
      </section>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button type="primary" @click="emitConfirm()">确 定</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { Upload, Edit, Check } from '@element-plus/icons-vue';
import Ruby from './Ruby.vue';

export default defineComponent({
  components: {
    Ruby,
    Upload,
    Edit,
    Check,
  },
  props: {
    show: { type: Boolean, required: true },
    picture: { type: String, required: true },
    title: { type: String, required: true },
    artist: { type: String, required: true },
    album: { type: String, required: true },
    albumartist: { type: String, required: true },
    genre: { type: String, required: true },
  },
  data() {
    return {
      form: {},
      imgFile: { tmpblob: undefined, blob: undefined, url: undefined } as {
        tmpblob?: Blob;
        blob?: Blob;
        url?: string;
      },
      editPicture: false,
      editTitle: false,
      editArtist: false,
      editAlbum: false,
      editAlbumartist: false,
      editGenre: false,
    };
  },
  computed: {
    visible: {
      get(): boolean {
        return this.show;
      },
      set(val: boolean) {
        if (!val) {
          this.cancel();
        }
      },
    },
  },
  async mounted() {
    this.refreshForm();
  },
  methods: {
    addFile(file: any) {
      this.imgFile.tmpblob = file.raw;
    },
    rmvFile() {
      this.imgFile.tmpblob = undefined;
    },
    changeCover() {
      this.editPicture = !this.editPicture;
      if (!this.editPicture && this.imgFile.tmpblob) {
        this.imgFile.blob = this.imgFile.tmpblob;
        if (this.imgFile.url) {
          URL.revokeObjectURL(this.imgFile.url);
        }
        this.imgFile.url = URL.createObjectURL(this.imgFile.blob);
      }
    },

    async refreshForm() {
      if (this.imgFile.url) {
        URL.revokeObjectURL(this.imgFile.url);
      }
      this.imgFile = { tmpblob: undefined, blob: undefined, url: undefined };
      this.editPicture = false;
      this.editTitle = false;
      this.editArtist = false;
      this.editAlbum = false;
      this.editAlbumartist = false;
      this.editGenre = false;
    },
    async cancel() {
      this.refreshForm();
      this.$emit('cancel');
    },
    async emitConfirm() {
      if (this.editPicture) {
        this.changeCover();
      }
      if (this.imgFile.url) {
        URL.revokeObjectURL(this.imgFile.url);
      }
      this.$emit('ok', {
        picture: this.imgFile.blob,
        title: this.title,
        artist: this.artist,
        album: this.album,
        albumartist: this.albumartist,
        genre: this.genre,
      });
    },
  },
});
</script>
