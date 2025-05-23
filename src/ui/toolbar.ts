import { Settings } from '../core/settings';
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
      logseq.UI.showMsg('Starting backup of all pages...');

      if (backupService) {
        await backupService.backupAllPages();
      } else {
        // Call through the model when no direct service reference
        logseq.UI.showMsg('Starting backup of all pages...');
        logseq.provideUI({
          key: 'backupAllPages',
          slot: '',
          reset: true,
          template: '<div>Backup in progress...</div>'
        });
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
      // Show immediate feedback
      logseq.UI.showMsg('Starting full backup of all pages and assets...', 'info');

      try {
        if (backupService) {
          await backupService.backupAllPages();
        } else {
          // Fallback to model
          logseq.provideUI({
            key: 'backupAllPages',
            slot: '',
            reset: true,
            template: '<div>Backup in progress...</div>'
          });
        }
      } catch (error) {
        console.error('Error during backup:', error);
        logseq.UI.showMsg('Backup failed. See console for details.', 'error');
      }
    }
  });
}