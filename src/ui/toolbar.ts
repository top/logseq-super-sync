import { Settings, getEnabledProviders } from '../core/settings';
import { BackupService } from '../services/backup-service';

/**
 * Sets up the toolbar UI
 * @param settings Plugin settings
 * @param backupService Backup service for direct actions
 */
export function setupToolbar(settings: Settings, backupService?: BackupService) {
  // Register slash command for the plugin
  logseq.Editor.registerSlashCommand(
    'Backup All Pages',
    async () => {
      if (backupService) {
        await backupService.backupAllPages();
      }
    }
  );

  // Add toolbar button that directly triggers backup
  logseq.App.registerUIItem('toolbar', {
    key: 'logseq-super-sync',
    template: `
      <a class="button" data-on-click="startFullBackup" title="Start Full Backup">
        <i class="ti ti-cloud-upload"></i>
      </a>
    `
  });

  // Register direct action handler
  logseq.provideModel({
    async startFullBackup() {
      // Get current settings to check enabled providers
      const currentSettings = Object.assign({}, settings, logseq.settings) as Settings;
      const enabledProviders = getEnabledProviders(currentSettings);

      if (enabledProviders.length === 0) {
        logseq.UI.showMsg(
          '⚠️ No backup providers enabled. Please configure S3/WebDAV/Local in settings first.',
          'warning'
        );
        return;
      }

      try {
        if (backupService) {
          await backupService.backupAllPages();
        }
      } catch (error) {
        console.error('Error during backup:', error);
        logseq.UI.showMsg('Backup failed. See console for details.', 'error');
      }
    }
  });
}