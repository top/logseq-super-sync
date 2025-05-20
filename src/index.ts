import '@logseq/libs';
import { SuperSyncPlugin } from './core/plugin';
import { DEFAULT_SETTINGS } from './core/settings';
import { SyncService } from './services/sync-service';
import { BackupService } from './services/backup-service';
import { setupEventHandlers } from './core/events';

// Entry point of the plugin
async function main() {
  try {
    const settings = Object.assign({}, DEFAULT_SETTINGS, logseq.settings);

    const backupService = new BackupService(settings);
    await backupService.initialize();

    const syncService = new SyncService(settings);
    await syncService.initialize();

    setupEventHandlers(backupService);

    // await syncService.performInitialSync();

    const plugin = new SuperSyncPlugin(backupService, syncService);
    await plugin.initialize();

    console.info('Logseq Super Sync plugin loaded successfully!');
  } catch (error) {
    console.error('Failed to initialize plugin:', error);
    logseq.UI.showMsg('Failed to initialize plugin. See console for details.', 'error');
  }
}

// Run the main function when Logseq is ready
logseq.ready(main).catch(console.error);
