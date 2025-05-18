import { BackupService } from '../services/backup-service';

/**
 * Sets up event handlers for the plugin
 * @param backupService Backup service instance
 */
export function setupEventHandlers(backupService: BackupService): void {
  // Buffer to collect changes
  let changeBuffer: Array<{ blocks: any[], txData: any, txMeta: any }> = [];
  let debounceTimer: NodeJS.Timeout | null = null;
  const DEBOUNCE_DELAY = 5000; // 5 seconds

  // Monitor page content changes with debouncing
  logseq.DB.onChanged(async ({ blocks, txData, txMeta }) => {
    try {
      // Add change to buffer
      changeBuffer.push({ blocks, txData, txMeta });

      // Reset the debounce timer every time a change occurs
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      // Set a new timer that only processes changes after 5 seconds of inactivity
      debounceTimer = setTimeout(() => {
        backupService.processChanges(changeBuffer)
          .catch(err => console.error('Error in change processing:', err));

        // Clear buffer and timer
        changeBuffer = [];
        debounceTimer = null;
      }, DEBOUNCE_DELAY);
    } catch (error) {
      console.error('Error handling change event:', error);
    }
  });
}