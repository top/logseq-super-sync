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
   * Compare local and remote files to determine which is newer
   */
  async diffWithRemote(filePath: string, localTimestamp: Date): Promise<'local-newer' | 'remote-newer' | 'same' | 'remote-missing'> {
    try {
      const remoteTimestamp = await this.getFileLastModified(filePath);
      
      if (!remoteTimestamp) {
        return 'remote-missing';
      }
      
      if (localTimestamp > remoteTimestamp) {
        return 'local-newer';
      } else if (localTimestamp < remoteTimestamp) {
        return 'remote-newer';
      } else {
        return 'same';
      }
    } catch (error) {
      console.error(`Error comparing with remote in ${this.name}:`, error);
      return 'remote-missing'; // Conservative handling on failure
    }
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