import { Settings, getEnabledProviders } from '../core/settings';
import { BackupProvider, BackupMetadata } from '../providers/provider.interface';
import { BaseBackupProvider } from '../providers/base-provider';
import { ProviderRegistry } from '../providers/provider-registry';

/**
 * Service responsible for handling bidirectional synchronization
 */
export class SyncService {
  private providers: Map<string, BackupProvider>;
  private settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
    this.providers = new Map();
  }

  /**
   * Initialize all providers
   */
  async initialize(): Promise<boolean> {
    try {
      // Get list of enabled providers
      const enabledProviderNames = getEnabledProviders(this.settings);

      // Create and initialize each enabled provider
      for (const providerName of enabledProviderNames) {
        const provider = ProviderRegistry.createProvider(providerName);
        if (provider) {
          const success = await provider.initialize(this.settings);
          if (success) {
            this.providers.set(providerName, provider);
            console.info(`Provider ${providerName} initialized for sync service`);
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize sync service:', error);
      return false;
    }
  }

  /**
   * Update service settings
   */
  async updateSettings(newSettings: Settings): Promise<void> {
    const previousProviders = getEnabledProviders(this.settings);
    this.settings = newSettings;
    const currentProviders = getEnabledProviders(this.settings);

    // Handle provider changes
    if (JSON.stringify(previousProviders) !== JSON.stringify(currentProviders)) {
      // Remove providers that are no longer enabled
      for (const providerName of previousProviders) {
        if (!currentProviders.includes(providerName)) {
          this.providers.delete(providerName);
        }
      }

      // Add newly enabled providers
      for (const providerName of currentProviders) {
        if (!previousProviders.includes(providerName) && !this.providers.has(providerName)) {
          const provider = ProviderRegistry.createProvider(providerName);
          if (provider) {
            const success = await provider.initialize(this.settings);
            if (success) {
              this.providers.set(providerName, provider);
            }
          }
        }
      }
    }

    // Clear cached backups on settings change
    for (const provider of this.providers.values()) {
      (provider as any)._cachedBackups = null;
    }
  }

  /**
   * Perform initial synchronization on Logseq startup
   */
  async performInitialSync(): Promise<void> {
    console.info('Starting initial synchronization on startup...');

    try {
      // Get list of pages to sync
      const pages = await logseq.Editor.getAllPages() || [];

      // For each provider, get the full backup list ONCE
      for (const [providerName, provider] of this.providers.entries()) {
        if (!this.isProviderEnabled(providerName)) continue;

        // Get all backups for this provider
        const backups = await provider.listBackups();
        (provider as any)._cachedBackups = backups;
        console.info(`Retrieved ${backups.length} backups from ${providerName}`);
      }

      // Now process each page with cached backups
      for (const page of pages) {
        await this.syncPage(page.name);
      }

      console.info('Initial synchronization completed successfully');
    } catch (error) {
      console.error('Error during initial synchronization:', error);
    }
  }

  /**
   * Sync a specific page
   */
  async syncPage(pageName: string): Promise<void> {
    try {
      const page = await logseq.Editor.getPage(pageName);
      if (!page) {
        console.warn(`Page not found: ${pageName}`);
        return;
      }

      const filePath = await this.getPageFilePath(page); // Changed to await
      if (!filePath) {
        console.warn(`File path not found for page: ${pageName}`);
        return;
      }

      const localUpdatedAt = new Date(page.updatedAt || Date.now());

      for (const [providerName, provider] of this.providers.entries()) {
        if (!this.isProviderEnabled(providerName)) {
          continue;
        }

        const baseProvider = provider as unknown as BaseBackupProvider;
        const diffResult = await baseProvider.diffWithRemote(filePath, localUpdatedAt);

        switch (diffResult) {
          case 'local-newer':
            console.log(`Local version of "${pageName}" is newer, pushing to ${providerName}`);
            await this.pushToRemote(provider, pageName, filePath, page.content);
            break;

          case 'remote-newer':
            console.log(`Remote version of "${pageName}" is newer on ${providerName}, pulling`);
            await this.pullFromRemote(provider, pageName, filePath);
            break;

          case 'same':
            console.log(`Page "${pageName}" is already in sync with ${providerName}`);
            break;

          case 'remote-missing':
            console.log(`Page "${pageName}" doesn't exist on ${providerName}, pushing`);
            await this.pushToRemote(provider, pageName, filePath, page.content);
            break;
        }
      }
    } catch (error) {
      console.error(`Error synchronizing page "${pageName}":`, error);
    }
  }
  private isProviderEnabled(providerName: string): boolean {
    switch (providerName) {
      case 's3':
        return !!(this.settings.s3_bucketName &&
          this.settings.s3_accessKeyId &&
          this.settings.s3_secretAccessKey);
      default:
        return false;
    }
  }

  private async getPageFilePath(page: any): Promise<string | null> {
    try {
      // Get the current graph name
      const graph = await logseq.App.getCurrentGraph();
      const graphName = graph?.name || 'default';

      let fileName: string;
      let basePath: string;

      // For journal pages, construct path from journalDay
      if (page['journal?'] === true && page.journalDay) {
        const journalDayStr = String(page.journalDay);
        const year = journalDayStr.substring(0, 4);
        const month = journalDayStr.substring(4, 6);
        const day = journalDayStr.substring(6, 8);
        fileName = `${year}_${month}_${day}.md`;
        basePath = `journals/${fileName}`;
      }
      // For regular pages with file path
      else if (page.file?.path) {
        // If path already has the graph name, use it directly
        if (page.file.path.includes(`/${graphName}/`)) {
          return page.file.path;
        }

        // Otherwise construct proper path
        return `${graphName}/${page.file.path}`;
      }
      // Fallback: construct path from page name
      else if (page.name) {
        fileName = `${page.name.replace(/ /g, '_').replace(/[^\w\d_.-]/g, '').toLowerCase()}.md`;
        basePath = `pages/${fileName}`;
      } else {
        return null;
      }

      // Do not include graph name if path already has it
      if (basePath.includes(`/${graphName}/`)) {
        return basePath;
      }

      // Include graph name in the path
      return `${graphName}/${basePath}`;
    } catch (error) {
      console.error('Error generating page file path:', error);
      return null;
    }
  }

  private async pushToRemote(
    provider: BackupProvider,
    pageName: string,
    filePath: string,
    content: string
  ): Promise<boolean> {
    try {
      console.info(`Pushing page "${pageName}" to ${provider.name}`);

      const encoder = new TextEncoder();
      const fileContent = encoder.encode(content);

      // Check if this is a journal page
      const isJournal = pageName.match(/^\d{4}-\d{2}-\d{2}/);
      const fileType = isJournal ? 'journal' : 'page';

      // Consistent filename derivation
      const fileName = filePath.split('/').pop() || '';

      const metadata: BackupMetadata = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        graphName: await this.getGraphName(),
        pageName: pageName,
        fileType: fileType,
        filePath: filePath,
        fileName: fileName,
        size: fileContent.byteLength
      };

      return await provider.backup(fileContent, metadata);
    } catch (error) {
      console.error(`Error pushing page "${pageName}" to ${provider.name}:`, error);
      return false;
    }
  }

  private async pullFromRemote(
    provider: BackupProvider,
    pageName: string,
    filePath: string
  ): Promise<boolean> {
    try {
      console.info(`Pulling page "${pageName}" from ${provider.name}`);

      // Get all backups from the provider
      const backups = await provider.listBackups();

      // Handle journal pages differently
      const isJournal = pageName.match(/^\d{4}-\d{2}-\d{2}/);

      // Create multiple possible formats for searching
      let possibleFilePaths = [filePath];

      if (isJournal) {
        // Convert page name to expected file name format
        // e.g. "2022-11-06 sunday" -> "2022_11_06.md"
        const datePart = pageName.substring(0, 10).replace(/-/g, '_');
        const journalFileName = `${datePart}.md`;

        // Add possible file paths with different directory structures
        const graph = await logseq.App.getCurrentGraph();
        const graphName = graph?.name || 'default';

        possibleFilePaths = [
          filePath,
          `journals/${journalFileName}`,
          `${graphName}/journals/${journalFileName}`
        ];

        console.debug(`Journal page: ${pageName}, looking for possible paths:`, possibleFilePaths);
      }

      // Enhanced filtering to find the right backup
      const pageBackups = backups.filter(b => {
        // Check page name
        if (b.pageName === pageName) return true;

        // Check any of the possible file paths
        return possibleFilePaths.some(path =>
          b.filePath ? (b.filePath === path || b.filePath.endsWith(path)) : false
        );
      }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (pageBackups.length === 0) {
        console.warn(`No backups found for page "${pageName}" with any of these paths:`, possibleFilePaths);
        return false;
      }

      const latestBackup = pageBackups[0];
      console.info(`Found backup for "${pageName}" from ${new Date(latestBackup.timestamp).toLocaleString()}`);

      const fileContent = await provider.restoreBackup(latestBackup.timestamp);
      if (!fileContent) {
        console.error(`Failed to restore backup for page "${pageName}"`);
        return false;
      }

      const decoder = new TextDecoder('utf-8');
      const contentString = decoder.decode(fileContent);

      try {
        await logseq.Editor.updatePage(pageName, contentString);
        console.log(`Updated local page "${pageName}" from remote`);
        return true;
      } catch (updateError) {
        console.error(`Error updating page content: ${updateError}`);
        return false;
      }
    } catch (error) {
      console.error(`Error pulling page "${pageName}" from ${provider.name}:`, error);
      return false;
    }
  }

  private async getGraphName(): Promise<string> {
    try {
      const graph = await logseq.App.getCurrentGraph();
      return graph?.name || 'default';
    } catch (error) {
      console.error('Error getting graph name:', error);
      return 'default';
    }
  }
}
