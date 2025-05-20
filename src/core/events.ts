import { BackupService } from '../services/backup-service';

// Global debounce control with timestamp tracking
let debounceData = {
  timer: null as NodeJS.Timeout | null,
  changeBuffer: [] as Array<{ blocks: any[], txData: any, txMeta: any }>,
  isProcessing: false,
  lastEditTimestamp: 0
};

/**
 * Sets up event handlers for the plugin
 * @param backupService Backup service instance
 */
export function setupEventHandlers(backupService: BackupService): void {
  // Clean up any existing timer on setup
  if (debounceData.timer) {
    clearTimeout(debounceData.timer);
    debounceData.timer = null;
  }

  // Reset global state
  debounceData.changeBuffer = [];
  debounceData.isProcessing = false;
  debounceData.lastEditTimestamp = 0;

  // Monitor page content changes with true strict debouncing
  logseq.DB.onChanged(async ({ blocks, txData, txMeta }) => {
    try {
      // Add change to buffer
      debounceData.changeBuffer.push({ blocks, txData, txMeta });

      // Update last edit timestamp - ALWAYS DO THIS
      debounceData.lastEditTimestamp = Date.now();

      // IMPORTANT: Always reset timer on ANY edit - regardless of processing state
      resetDebounceTimer(backupService);

    } catch (error) {
      console.error('Error handling change event:', error);
    }
  });

  // Add a cleanup mechanism when plugin is disabled
  logseq.beforeunload(async () => {
    if (debounceData.timer) {
      clearTimeout(debounceData.timer);
      debounceData.timer = null;
    }

    // Process any pending changes before unloading if buffer isn't empty
    if (debounceData.changeBuffer.length > 0 && !debounceData.isProcessing) {
      await backupService.processChanges(debounceData.changeBuffer)
        .catch(err => console.error('Error in final change processing:', err));
    }
  });
}

/**
 * Reset the global debounce timer
 * This is the single source of truth for timer management
 */
function resetDebounceTimer(backupService: BackupService): void {
  // Clear existing timer if any - ALWAYS do this
  if (debounceData.timer) {
    clearTimeout(debounceData.timer);
    debounceData.timer = null;
  }

  // Get debounce time from settings (in seconds) and convert to milliseconds
  const debounceDelay = (backupService.settings.debounceTime || 5) * 1000;

  // Set a new timer that will only fire after complete inactivity
  debounceData.timer = setTimeout(() => {
    // When timer fires, check if there's been any activity since it was scheduled
    const inactivityTime = Date.now() - debounceData.lastEditTimestamp;

    if (inactivityTime < debounceDelay) {
      console.log(`Timer fired too early: only ${inactivityTime}ms of inactivity, needs ${debounceDelay}ms`);
      // If there was activity, reset the timer again
      resetDebounceTimer(backupService);
    } else {
      // If there was complete inactivity for the full period, process changes
      console.log(`Processing after ${inactivityTime}ms of complete inactivity`);
      processChangesIfNeeded(backupService);
    }
  }, debounceDelay);
}

/**
 * Process changes if there are any in the buffer
 */
async function processChangesIfNeeded(backupService: BackupService): Promise<void> {
  // Only process if we have changes and aren't already processing
  if (debounceData.changeBuffer.length === 0 || debounceData.isProcessing) {
    return;
  }

  try {
    // Mark as processing
    debounceData.isProcessing = true;

    // Make a local copy of changes and clear the buffer
    const changesSnapshot = [...debounceData.changeBuffer];
    debounceData.changeBuffer = [];

    // Process changes
    const debounceDelay = backupService.settings.debounceTime || 5;
    console.info(`Processing ${changesSnapshot.length} changes after ${debounceDelay}s of complete inactivity`);

    await backupService.processChanges(changesSnapshot);
  } catch (error) {
    console.error('Error processing changes:', error);
  } finally {
    // Reset processing flag
    debounceData.isProcessing = false;

    // Check if new changes came in during processing
    if (debounceData.changeBuffer.length > 0) {
      // If so, start a new timer
      resetDebounceTimer(backupService);
    }
  }
}