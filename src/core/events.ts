import '@logseq/libs';
import { BackupService } from '../services/backup-service';

// State tracking for debounce logic
let syncState = {
  changeBuffer: [] as Array<{ blocks: any[], txData: any, txMeta: any }>,
  isChanged: false,
  debounceTimer: null as ReturnType<typeof setTimeout> | null
};

/**
 * Sets up event handlers for the plugin
 * @param backupService Backup service instance
 */
export function setupEventHandlers(backupService: BackupService): void {
  // Clean up any existing timer on setup
  if (syncState.debounceTimer) {
    clearTimeout(syncState.debounceTimer);
    syncState.debounceTimer = null;
  }

  // Reset state
  syncState.changeBuffer = [];
  syncState.isChanged = false;

  const debounceMs = (backupService.getDebounceTime() || 5) * 1000;

  console.info(`Auto-backup configured: will trigger ${debounceMs / 1000}s after editing stops`);

  // Monitor page content changes - collect changes and reset debounce timer
  logseq.DB.onChanged(async ({ blocks, txData, txMeta }) => {
    // Add change to buffer
    syncState.changeBuffer.push({ blocks, txData, txMeta });

    // Mark as changed - our trigger flag
    syncState.isChanged = true;

    // Clear any existing debounce timer - this is the key to proper debouncing
    if (syncState.debounceTimer) {
      clearTimeout(syncState.debounceTimer);
    }

    // Set a new timer - only fires if no more changes come in within debounceMs
    syncState.debounceTimer = setTimeout(() => {
      if (syncState.isChanged) {
        console.debug(`Processing changes after ${debounceMs / 1000}s of inactivity`);
        processChanges(backupService);
      }
    }, debounceMs);
  });

  // Cleanup on plugin disable
  logseq.beforeunload(async () => {
    if (syncState.debounceTimer) {
      clearTimeout(syncState.debounceTimer);
      syncState.debounceTimer = null;
    }

    // Final sync if needed - bypass debounce for shutdown
    if (syncState.isChanged) {
      await processChanges(backupService);
    }
  });
}

/**
 * Process changes - runs after debounce period
 */
async function processChanges(backupService: BackupService): Promise<void> {
  try {
    // Immediately reset the change flag
    syncState.isChanged = false;

    // Clear the timer reference
    syncState.debounceTimer = null;

    // Capture current changes
    const changes = [...syncState.changeBuffer];
    syncState.changeBuffer = [];

    // Process the changes
    console.info(`Processing ${changes.length} buffered changes`);
    await backupService.processChanges(changes);
  } catch (error) {
    console.error('Error processing changes:', error);
  }
}