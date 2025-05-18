import { BackupProvider } from './provider.interface';
import { S3BackupProvider } from './s3-provider';

/**
 * Provider registry responsible for creating and managing provider instances
 */
export class ProviderRegistry {
  /**
   * Create a provider instance based on provider name
   * @param providerName Provider name
   * @returns Provider instance or null if provider doesn't exist
   */
  static createProvider(providerName: string): BackupProvider | null {
    switch (providerName) {
      case 's3':
        return new S3BackupProvider();
      // case 'git':
      //   return new GitBackupProvider();
      // case 'local':
      //   return new LocalBackupProvider();
      default:
        console.warn(`Unknown provider type: ${providerName}`);
        return null;
    }
  }
}