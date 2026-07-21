import { ElNotification, ElMessageBox } from 'element-plus';

declare module 'vue' {
  interface ComponentCustomProperties {
    $notify: typeof ElNotification;
    $confirm: typeof ElMessageBox.confirm;
    $message: typeof ElMessageBox;
  }
}

declare global {
  interface Window {
    _paq: any[];
    showDirectoryPicker?: () => Promise<any>;
  }
}

export {};
