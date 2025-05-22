import { BackupService } from '../services/backup-service';

// Enhanced state tracking - added lastChangeTimestamp
let syncState = {
  changeBuffer: [] as Array<{ blocks: any[], txData: any, txMeta: any }>,
  isChanged: false,
  intervalTimer: null as NodeJS.Timeout | null,
  lastChangeTimestamp: 0  // Track when the last change occurred
};

/**
 * Sets up event handlers for the plugin
 * @param backupService Backup service instance
 */
export function setupEventHandlers(backupService: BackupService): void {
  // Clean up any existing timer on setup
  if (syncState.intervalTimer) {
    clearInterval(syncState.intervalTimer);
    syncState.intervalTimer = null;
  }

  // Reset state
  syncState.changeBuffer = [];
  syncState.isChanged = false;
  syncState.lastChangeTimestamp = 0;

  // Monitor page content changes - collect changes, mark as changed, and update timestamp
  logseq.DB.onChanged(async ({ blocks, txData, txMeta }) => {
    // Add change to buffer
    syncState.changeBuffer.push({ blocks, txData, txMeta });

    // Mark as changed - our trigger flag
    syncState.isChanged = true;

    // Update the last change timestamp with current time
    syncState.lastChangeTimestamp = Date.now();
  });

  // Set up the timer to check for changes
  const intervalSeconds = backupService.getDebounceTime() || 5;
  syncState.intervalTimer = setInterval(() => {
    const inactivitySeconds = (Date.now() - syncState.lastChangeTimestamp) / 1000;
    const minInactivitySeconds = intervalSeconds;

    // Check both conditions: changes exist AND enough inactive time has passed
    if (syncState.isChanged && inactivitySeconds >= minInactivitySeconds) {
      console.debug(`Processing changes after ${inactivitySeconds.toFixed(1)}s of inactivity`);
      processChanges(backupService);
    }
  }, intervalSeconds * 1000);

  console.info(`Sync check scheduled every ${intervalSeconds} seconds, requires ${intervalSeconds}s inactivity`);

  // Cleanup on plugin disable
  logseq.beforeunload(async () => {
    if (syncState.intervalTimer) {
      clearInterval(syncState.intervalTimer);
      syncState.intervalTimer = null;
    }

    // Final sync if needed - bypass inactivity check for shutdown
    if (syncState.isChanged) {
      await processChanges(backupService);
    }
  });
}

/**
 * Process changes - runs independently on timer schedule
 */
async function processChanges(backupService: BackupService): Promise<void> {
  try {
    // Immediately reset the change flag
    syncState.isChanged = false;

    // Capture current changes
    const changes = [...syncState.changeBuffer];
    syncState.changeBuffer = [];

    // Process the changes
    console.info(`Processing ${changes.length} changes`);
    await backupService.processChanges(changes);
  } catch (error) {
    console.error('Error processing changes:', error);
  }
}