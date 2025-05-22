import { Settings } from '../core/settings';

/**
 * Metadata for a backup
 */
export interface BackupMetadata {
  /** ISO timestamp when backup was created */
  timestamp: string;

  /** Backup format version */
  version: string;

  /** Name of the graph being backed up */
  graphName: string;

  /** Name of the page being backed up */
  pageName: string;

  /** Type of file being backed up */
  fileType?: 'journal' | 'page' | 'asset';

  /** Relative path of the file within the graph */
  filePath?: string;

  /** Filename of the backup */
  fileName?: string;

  /** Size in bytes */
  size: number;

  journalDay?: string; // Optional, only for journal files
}

/**
 * Interface that all backup providers must implement
 */
export interface BackupProvider {
  /** Provider name */
  name: string;

  /**
   * Initialize the provider with settings
   * @param settings Plugin settings
   * @returns Promise resolving to true if initialization succeeded
   */
  initialize(settings: Settings): Promise<boolean>;

  /**
   * Backup data to the storage provider
   * @param data Binary data to backup
   * @param metadata Metadata for the backup
   * @returns Promise resolving to true if backup succeeded
   */
  backup(data: Uint8Array, metadata: BackupMetadata): Promise<boolean>;

  /**
   * List available backups
   * @returns Promise resolving to array of backup metadata
   */
  listBackups(): Promise<BackupMetadata[]>;

  /**
   * Restore a backup by timestamp
   * @param timestamp Timestamp of backup to restore
   * @returns Promise resolving to backup data or null if not found
   */
  restoreBackup(timestamp: string): Promise<Uint8Array | null>;

  /**
   * Delete a backup by timestamp
   * @param timestamp Timestamp of backup to delete
   * @returns Promise resolving to true if deletion succeeded
   */
  deleteBackup(timestamp: string): Promise<boolean>;
}