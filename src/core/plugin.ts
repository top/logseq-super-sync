import { Settings, DEFAULT_SETTINGS, settingsSchema } from './settings';
import { BackupService } from '../services/backup-service';
import { SyncService } from '../services/sync-service';
import { setupToolbar } from '../ui/toolbar';
import { setupEventHandlers } from './events';

/**
 * Core plugin class that manages the overall plugin functionality
 */
export class SuperSyncPlugin {
  private settings: Settings;
  private backupService: BackupService;
  private syncService: SyncService;

  /**
   * Creates a new instance of the plugin
   */
  constructor() {
    // Initialize settings with defaults
    this.settings = Object.assign({}, DEFAULT_SETTINGS);
    this.backupService = new BackupService(this.settings);
    this.syncService = new SyncService(this.settings);
  }

  /**
   * Initialize the plugin
   */
  async initialize(): Promise<void> {
    console.info('Initializing Super Sync plugin');

    try {
      // Register settings schema with Logseq
      logseq.useSettingsSchema(settingsSchema);

      // Load user settings
      this.settings = Object.assign({}, DEFAULT_SETTINGS, logseq.settings);
      console.info('Settings loaded');

      // Initialize services
      await this.backupService.initialize();
      await this.syncService.initialize();

      // Setup UI
      setupToolbar(this.settings, this.backupService);

      // Setup event handlers
      setupEventHandlers(this.backupService);

      // Register model for UI interaction
      this.registerModel();

      console.info('Plugin initialized successfully');

      // Show welcome message
      logseq.App.showMsg('Logseq Super Sync plugin loaded successfully!', 'success');
    } catch (error) {
      console.error('Failed to initialize plugin:', error);
      logseq.App.showMsg('Failed to initialize plugin. See console for details.', 'error');
    }
  }

  /**
   * Register model with Logseq UI framework
   */
  private registerModel(): void {
    logseq.provideModel({
      backupCurrentPage: async () => {
        try {
          const currentPage = await logseq.Editor.getCurrentPage();
          if (currentPage) {
            await this.backupService.backupPage(currentPage.name);
          } else {
            logseq.App.showMsg('No page is currently open', 'warning');
          }
        } catch (error) {
          console.error('Error backing up current page:', error);
          logseq.App.showMsg('Backup failed. See console for details.', 'error');
        }
      },

      backupAllPages: async () => {
        try {
          await this.backupService.backupAllPages();
        } catch (error) {
          console.error('Error in full backup:', error);
          logseq.App.showMsg('Full backup failed. See console for details.', 'error');
        }
      }
    });

    // Settings changed handler
    logseq.onSettingsChanged((newSettings) => {
      console.info('Settings updated');
      this.settings = Object.assign({}, this.settings, newSettings);
      this.backupService.updateSettings(this.settings);
      this.syncService.updateSettings(this.settings);
    });
  }
}