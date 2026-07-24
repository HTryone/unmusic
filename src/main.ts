import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
// 必须排在 element-plus 全量主题 CSS 之后，确保我们的暗色覆盖规则
// 在运行时后注入、确定性地压过 EP 默认的亮色 hover/焦点样式。
import '@/scss/unlock-music.scss';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import App from '@/App.vue';
import { ElNotification, ElMessageBox } from 'element-plus';

const app = createApp(App);

// Register all Element Plus icons globally
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(ElementPlus);

// Preserve legacy $notify / $confirm global helpers used across components
app.config.globalProperties.$notify = ElNotification;
app.config.globalProperties.$confirm = ElMessageBox.confirm;
app.config.globalProperties.$message = ElMessageBox;

app.mount('#app');
