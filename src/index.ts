import '@logseq/libs';
import { SuperSyncPlugin } from './core/plugin';
import { ProviderRegistry } from './providers/provider-registry';
import { Settings, DEFAULT_SETTINGS } from './core/settings';
import { SyncService } from './services/sync-service';
import { BackupService } from './services/backup-service';
import { setupEventHandlers } from './core/events';

// Entry point of the plugin
async function main() {
  try {
    // 加载设置
    const settings = Object.assign({}, DEFAULT_SETTINGS, logseq.settings);

    // 创建服务
    const backupService = new BackupService(settings);
    await backupService.initialize();

    // 设置同步服务
    const syncService = new SyncService(settings);
    await syncService.initialize();

    // 设置事件处理程序
    setupEventHandlers(backupService);

    // 在启动时执行初始同步（如果配置允许）
    if (settings.backupTrigger === "automatic") {
      await syncService.performInitialSync();
    }

    // 创建和初始化完整插件
    const plugin = new SuperSyncPlugin(backupService, syncService);
    await plugin.initialize();

    console.info('Logseq Super Sync plugin loaded successfully!');
  } catch (error) {
    console.error('Failed to initialize plugin:', error);
    logseq.App.showMsg('Failed to initialize plugin. See console for details.', 'error');
  }
}

// Run the main function when Logseq is ready
logseq.ready(main).catch(console.error);