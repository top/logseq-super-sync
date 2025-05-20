import { BackupService } from '../services/backup-service';

// Global debounce control with timestamp tracking
let debounceData = {
  timer: null as NodeJS.Timeout | null,
  changeBuffer: [] as Array<{ blocks: any[], txData: any, txMeta: any }>,
  isProcessing: false,
  lastEditTimestamp: 0, 
  processScheduledTimestamp: 0 
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
  debounceData.processScheduledTimestamp = 0;

  // Monitor page content changes with true strict debouncing
  logseq.DB.onChanged(async ({ blocks, txData, txMeta }) => {
    try {
      // Add change to buffer
      debounceData.changeBuffer.push({ blocks, txData, txMeta });

      // Update last edit timestamp
      debounceData.lastEditTimestamp = Date.now();

      // If already processing, don't interfere with the process
      if (debounceData.isProcessing) {
        return;
      }

      // Every edit action completely resets the timer
      trueStrictDebounce(backupService);

    } catch (error) {
      console.error('Error handling change event:', error);
    }
  });

  // Add a cleanup mechanism when plugin is disabled
  logseq.beforeunload(() => {
    if (debounceData.timer) {
      clearTimeout(debounceData.timer);
      debounceData.timer = null;
    }

    // Process any pending changes before unloading if buffer isn't empty
    if (debounceData.changeBuffer.length > 0 && !debounceData.isProcessing) {
      backupService.processChanges(debounceData.changeBuffer)
        .catch(err => console.error('Error in final change processing:', err));
    }
  });
}

/**
 * Implements true strict debounce - absolutely guarantees no processing 
 * until after complete inactivity period
 */
function trueStrictDebounce(backupService: BackupService): void {
  // Clear existing timer if any
  if (debounceData.timer) {
    clearTimeout(debounceData.timer);
    debounceData.timer = null;
  }

  // Get debounce time from settings (in seconds) and convert to milliseconds
  const debounceDelay = (backupService.settings.debounceTime || 5) * 1000;

  // Record when this processing is scheduled for
  debounceData.processScheduledTimestamp = Date.now() + debounceDelay;

  // Set a new timer with safety verification
  debounceData.timer = setTimeout(() => {
    // Double check if enough time has passed since last edit
    const now = Date.now();
    const timeSinceLastEdit = now - debounceData.lastEditTimestamp;

    if (timeSinceLastEdit < debounceDelay) {
      // Safety check - reschedule if edits happened but didn't reset timer
      console.log(`Safety check: only ${timeSinceLastEdit}ms since last edit, rescheduling`);
      trueStrictDebounce(backupService);
      return;
    }

    // Process the changes
    processDebounceChanges(backupService);
  }, debounceDelay);
}

/**
 * Process the changes after debounce period
 */
async function processDebounceChanges(backupService: BackupService): Promise<void> {
  try {
    // Mark as processing to prevent interference
    debounceData.isProcessing = true;

    // Get debounce time from settings for logging
    const debounceDelay = backupService.settings.debounceTime || 5;
    console.info(`Processing changes after ${debounceDelay}s of complete inactivity`);

    // Make a local copy of changes and clear the global buffer
    const changesSnapshot = [...debounceData.changeBuffer];
    debounceData.changeBuffer = [];

    // Process the changes
    await backupService.processChanges(changesSnapshot);

  } catch (err) {
    console.error('Error in debounced change processing:', err);
  } finally {
    // Reset state when done
    debounceData.timer = null;
    debounceData.isProcessing = false;

    // If new changes accumulated during processing, restart timer
    if (debounceData.changeBuffer.length > 0) {
      debounceData.lastEditTimestamp = Date.now();
      trueStrictDebounce(backupService);
    }
  }
}