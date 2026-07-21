import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
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
