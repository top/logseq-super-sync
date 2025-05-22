import { BackupProvider, BackupMetadata } from './provider.interface';
import { Settings } from '../core/settings';

/**
 * Abstract base class implementing common provider functionality
 */
export abstract class BaseBackupProvider implements BackupProvider {
  name: string;
  protected settings: Settings;
  protected initialized: boolean = false;

  constructor(name: string) {
    this.name = name;
    this.settings = {} as Settings;
  }

  /**
   * Initialize the provider
   */
  async initialize(settings: Settings): Promise<boolean> {
    this.settings = settings;
    this.initialized = await this.initializeProvider();
    return this.initialized;
  }

  /**
   * Backup data to storage provider
   */
  async backup(data: Uint8Array, metadata: BackupMetadata): Promise<boolean> {
    if (!this.initialized) {
      throw new Error(`${this.name} provider not initialized`);
    }

    try {
      const key = this.generateBackupKey(metadata);
      return await this.uploadFile(key, data, metadata);
    } catch (error) {
      console.error(`Error in ${this.name} backup:`, error);
      return false;
    }
  }

  /**
   * List all available backups
   */
  async listBackups(): Promise<BackupMetadata[]> {
    if (!this.initialized) {
      throw new Error(`${this.name} provider not initialized`);
    }

    try {
      return await this.listFiles();
    } catch (error) {
      console.error(`Error listing backups from ${this.name}:`, error);
      return [];
    }
  }

  /**
   * Restore a backup by timestamp
   */
  async restoreBackup(timestamp: string): Promise<Uint8Array | null> {
    if (!this.initialized) {
      throw new Error(`${this.name} provider not initialized`);
    }

    try {
      const key = await this.findFileByTimestamp(timestamp);
      if (!key) {
        return null;
      }
      return await this.downloadFile(key);
    } catch (error) {
      console.error(`Error restoring backup from ${this.name}:`, error);
      return null;
    }
  }

  /**
   * Delete a backup by timestamp
   */
  async deleteBackup(timestamp: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error(`${this.name} provider not initialized`);
    }

    try {
      const key = await this.findFileByTimestamp(timestamp);
      if (!key) {
        return false;
      }
      return await this.deleteFile(key);
    } catch (error) {
      console.error(`Error deleting backup from ${this.name}:`, error);
      return false;
    }
  }

  /**
   * Compare local and remote versions using cached backups when available
   */
  async diffWithRemote(filePath: string, localUpdatedAt: Date): Promise<'local-newer' | 'remote-newer' | 'same' | 'remote-missing'> {
    try {
      // Get metadata for this specific file
      const remoteMetadata = await this.getRemoteMetadataFromCache(filePath);

      if (!remoteMetadata) {
        return 'remote-missing';
      }

      // Parse the remote timestamp
      const remoteTimestamp = new Date(remoteMetadata.timestamp);

      // Compare timestamps (with small tolerance)
      const timeDifference = Math.abs(remoteTimestamp.getTime() - localUpdatedAt.getTime());
      if (timeDifference < 5000) {
        return 'same';
      }

      return localUpdatedAt > remoteTimestamp ? 'local-newer' : 'remote-newer';
    } catch (error) {
      console.error(`Error comparing with remote for ${filePath}:`, error);
      return 'local-newer'; // Default to local-newer on error
    }
  }

  /**
   * Get metadata from cache if available, otherwise fetch from remote
   */
  protected async getRemoteMetadataFromCache(filePath: string): Promise<BackupMetadata | null> {
    // Use cached backups if available
    const backups = (this as any)._cachedBackups || await this.listBackups();

    // Find backups that match this file path
    const matchingBackups = backups.filter((backup: BackupMetadata) =>
      backup.filePath && (backup.filePath === filePath || backup.filePath.endsWith(filePath))
    );

    if (matchingBackups.length === 0) return null;

    // Sort by timestamp and return latest
    matchingBackups.sort((a: BackupMetadata, b: BackupMetadata) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return matchingBackups[0];
  }

  // Provider-specific methods that need implementation
  protected abstract initializeProvider(): Promise<boolean>;
  protected abstract generateBackupKey(metadata: BackupMetadata): string;
  protected abstract uploadFile(key: string, data: Uint8Array, metadata: BackupMetadata): Promise<boolean>;
  protected abstract downloadFile(key: string): Promise<Uint8Array | null>;
  protected abstract listFiles(): Promise<BackupMetadata[]>;
  protected abstract findFileByTimestamp(timestamp: string): Promise<string | null>;
  protected abstract deleteFile(key: string): Promise<boolean>;
  protected abstract getFileLastModified(key: string): Promise<Date | null>;
}