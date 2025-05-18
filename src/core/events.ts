import { BackupService } from '../services/backup-service';

// Global debounce control
let debounceData = {
  timer: null as NodeJS.Timeout | null,
  changeBuffer: [] as Array<{ blocks: any[], txData: any, txMeta: any }>,
  isProcessing: false
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

  // Monitor page content changes with strict debouncing
  logseq.DB.onChanged(async ({ blocks, txData, txMeta }) => {
    try {
      // Add change to buffer
      debounceData.changeBuffer.push({ blocks, txData, txMeta });

      // Only process if automatic backup is enabled
      if (backupService.settings.backupTrigger !== "automatic") {
        return;
      }

      // If already processing, don't interfere with the process
      if (debounceData.isProcessing) {
        return;
      }

      // Every edit action completely resets the timer
      strictDebounce(backupService);
      
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
 * Implements strict debounce - only triggers after complete inactivity period
 */
function strictDebounce(backupService: BackupService): void {
  // Clear existing timer if any - this is the key to true debouncing
  if (debounceData.timer) {
    clearTimeout(debounceData.timer);
    debounceData.timer = null;
  }

  // Get debounce time from settings (in seconds) and convert to milliseconds
  const debounceDelay = (backupService.settings.debounceTime || 5) * 1000;
  
  // Set a new timer - will only execute if no new edits occur
  debounceData.timer = setTimeout(async () => {
    try {
      // We only reach here if no edits happened for the full debounce period
      
      // Mark as processing to prevent interference
      debounceData.isProcessing = true;
      
      // Log that we're processing after inactivity
      console.info(`Processing changes after ${debounceDelay/1000}s of inactivity`);
      
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
        strictDebounce(backupService);
      }
    }
  }, debounceDelay);
}