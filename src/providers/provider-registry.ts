import { BackupProvider } from './provider.interface';
import { S3BackupProvider } from './s3-provider';
import { WebDAVBackupProvider } from './webdav-provider';
import { LocalBackupProvider } from './local-provider';

/**
 * Factory function type for creating providers
 */
type ProviderFactory = () => BackupProvider;

/**
 * Provider registry responsible for creating and managing provider instances
 */
export class ProviderRegistry {
  private static providers = new Map<string, ProviderFactory>([
    ['s3', (): BackupProvider => new S3BackupProvider()],
    ['webdav', (): BackupProvider => new WebDAVBackupProvider()],
    ['local', (): BackupProvider => new LocalBackupProvider()],
    // Future providers:
    // ['ftp', () => new FTPBackupProvider()],
    // ['sftp', () => new SFTPBackupProvider()],
    // ['git', () => new GitBackupProvider()],
  ]);

  /**
   * Create a provider instance based on provider name
   * @param providerName Provider name
   * @returns Provider instance or null if provider doesn't exist
   */
  static createProvider(providerName: string): BackupProvider | null {
    const factory = this.providers.get(providerName);
    if (factory) {
      return factory();
    }
    console.warn(`Unknown provider type: ${providerName}`);
    return null;
  }

  /**
   * Get list of all available provider names
   * @returns Array of provider names
   */
  static getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Register a new provider factory
   * @param name Provider name
   * @param factory Factory function
   */
  static registerProvider(name: string, factory: ProviderFactory): void {
    this.providers.set(name, factory);
  }
}