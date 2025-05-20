import { Settings, getEnabledProviders } from '../core/settings';
import { createPageBackup, findAssetsInPage, detectTagPage } from '../utils/graph-utils';
import { ProviderRegistry } from '../providers/provider-registry';

const processedAssets = new Set<string>();

/**
 * Service responsible for handling backup operations
 */
export class BackupService {
  private settings: Settings;
  private providers: Record<string, any> = {};

  /**
   * Creates a new backup service
   * @param settings Application settings
   */
  constructor(settings: Settings) {
    this.settings = settings;
  }

  /**
   * Initializes the backup service with settings
   */
  async initialize(): Promise<void> {
    const enabledProviderNames = getEnabledProviders(this.settings);

    for (const providerName of enabledProviderNames) {
      try {
        await this.initializeProvider(providerName);
      } catch (error) {
        console.error(`Failed to initialize ${providerName} provider:`, error);
      }
    }
  }

  /**
   * Updates settings
   * @param newSettings New settings to apply
   */
  async updateSettings(newSettings: Settings): Promise<void> {
    const previousProviders = getEnabledProviders(this.settings);

    // Update settings
    this.settings = newSettings;

    // Check which providers are enabled after settings change
    const currentProviders = getEnabledProviders(this.settings);

    // If providers changed, reinitialize them
    if (JSON.stringify(previousProviders) !== JSON.stringify(currentProviders)) {
      console.info('Providers changed, reinitializing...');

      // Initialize new providers
      for (const providerName of currentProviders) {
        if (!previousProviders.includes(providerName)) {
          try {
            await this.initializeProvider(providerName);
          } catch (error) {
            console.error(`Failed to initialize ${providerName} provider:`, error);
          }
        }
      }
    }
  }

  /**
   * Initializes a specific provider
   * @param providerName Name of the provider to initialize
   */
  private async initializeProvider(providerName: string): Promise<void> {
    try {
      const provider = ProviderRegistry.createProvider(providerName);

      if (!provider) {
        console.error(`Provider ${providerName} not found in registry`);
        return;
      }

      const success = await provider.initialize(this.settings);

      if (success) {
        this.providers[providerName] = provider;
        console.info(`${providerName} provider initialized successfully`);
      } else {
        console.error(`Failed to initialize ${providerName} provider`);
      }
    } catch (error) {
      console.error(`Error initializing ${providerName} provider:`, error);
      throw error;
    }
  }

  /**
   * Processes database changes
   * @param changes Array of change events
   */
  async processChanges(changes: Array<{ blocks: any[], txData: any, txMeta: any }>): Promise<void> {
    if (changes.length === 0) return;

    console.info(`Processing ${changes.length} change events`);

    // Track which pages were modified to avoid duplicate backups
    const modifiedPages = new Set<string>();

    // Process each change event to identify modified pages
    for (const change of changes) {
      const { blocks, txMeta } = change;

      try {
        // Get information about which blocks were changed
        if (!blocks || blocks.length === 0) {
          continue;
        }

        // Process changed blocks and collect page names
        for (let i = 0; i < blocks.length; i++) {
          try {
            const block = blocks[i];
            if (!block) continue;

            // Enhanced page detection - try multiple approaches
            let pageName = '';
            let pageId = null;

            // Try direct pageName if available
            if (block.page?.name) {
              pageName = block.page.name;
              modifiedPages.add(pageName);
            }
            // Try page.id if available
            else if (block.page?.id) {
              pageId = block.page.id;
            }
            // Try page as string if it's just an ID
            else if (typeof block.page === 'string') {
              pageId = block.page;
            }
            // Try parent page
            else if (block.parent?.page) {
              const parentPage = block.parent.page;
              if (typeof parentPage === 'object' && parentPage.name) {
                pageName = parentPage.name;
                modifiedPages.add(pageName);
              } else if (typeof parentPage === 'object' && parentPage.id) {
                pageId = parentPage.id;
              } else if (typeof parentPage === 'string') {
                pageId = parentPage;
              }
            }

            // If we have a pageId but no name, try to get the page details
            if (pageId && !pageName) {
              try {
                const page = await logseq.Editor.getPage(pageId);
                if (page) {
                  pageName = page.originalName || page.name || '';
                  if (pageName) {
                    modifiedPages.add(pageName);
                  }
                }
              } catch (pageError) {
                console.warn(`Could not fetch page with ID ${pageId}:`, pageError);
              }
            }
          } catch (blockError) {
            console.error('Error processing individual block:', blockError);
          }
        }
      } catch (changeError) {
        console.error('Error processing change event:', changeError);
      }
    }

    // If backup is enabled, perform backup for each modified page
    console.info(`Found ${modifiedPages.size} modified pages to backup`);

    try {
      // Backup each modified page
      for (const pageName of modifiedPages) {
        await this.backupPage(pageName);
      }
    } catch (backupError) {
      console.error('Error performing backups:', backupError);
      logseq.UI.showMsg('Backup failed. Check console for details.', 'error');
    }
  }

  /**
   * Backs up a single page
   * @param pageName Name of the page to backup
   */
  async backupPage(pageName: string): Promise<void> {
    try {
      // Create the backup for this page
      const backup = await createPageBackup(pageName);

      if (!backup) {
        console.error(`Failed to create backup for page: ${pageName}`);
        return;
      }

      // Use the backup with each provider
      const results = await Promise.all(
        Object.entries(this.providers).map(async ([providerName, provider]) => {
          try {
            return await provider.backup(backup.data, backup.metadata);
          } catch (providerError) {
            console.error(`Error with ${providerName} provider for page ${pageName}:`, providerError);
            return false;
          }
        })
      );

      // Only show a single notification at the end
      const successCount = results.filter(Boolean).length;
      const providerCount = Object.keys(this.providers).length;

      if (successCount === providerCount) {
        logseq.UI.showMsg(`Backup of ${pageName} completed successfully`, 'success');
      } else if (successCount > 0) {
        logseq.UI.showMsg(
          `Backup of ${pageName} partially completed (${successCount}/${providerCount} providers)`,
          'warning'
        );
      } else {
        logseq.UI.showMsg(`Backup of ${pageName} failed`, 'error');
      }
    } catch (error) {
      console.error(`Error creating backup for page ${pageName}:`, error);
      logseq.UI.showMsg(`Backup failed: ${error.message}`, 'error');
    }
  }

  /**
   * Backs up all pages in the current graph
   */
  async backupAllPages(): Promise<void> {
    try {
      // Show progress notification
      logseq.UI.showMsg('Starting full vault backup...', 'info');

      // Get all pages
      const allPages = await logseq.Editor.getAllPages();
      if (!allPages || allPages.length === 0) {
        logseq.UI.showMsg('No pages found in the current graph', 'warning');
        return;
      }

      console.info(`Found ${allPages.length} pages to back up`);

      // Get enabled providers
      const enabledProviderNames = getEnabledProviders(this.settings);
      if (enabledProviderNames.length === 0) {
        logseq.UI.showMsg('No backup providers enabled. Please configure a provider first.', 'warning');
        return;
      }

      // Initialize tracking variables
      let successCount = 0;
      let errorCount = 0;

      // Reset processed assets set
      processedAssets.clear();

      // Process each page
      for (let i = 0; i < allPages.length; i++) {
        const page = allPages[i];
        try {
          // Update progress periodically
          if (i % 10 === 0 || i === allPages.length - 1) {
            logseq.UI.showMsg(`Backing up pages: ${i + 1} of ${allPages.length}`, 'info');
          }

          // Skip special system pages
          if (page.name.startsWith('logseq-') || page.name === 'contents' || page.name === 'card') {
            console.debug(`Skipping system page: ${page.name}`);
            continue;
          }

          // Skip tag pages
          if (detectTagPage(page)) {
            console.debug(`Skipping tag page: ${page.name}`);
            continue;
          }

          // Back up this page
          const backup = await createPageBackup(page.name);
          if (!backup) {
            console.error(`Failed to create backup for page: ${page.name}`);
            errorCount++;
            continue;
          }

          // Use the backup with each provider
          let pageBackupSuccessful = true;
          for (const [providerName, provider] of Object.entries(this.providers)) {
            try {
              const success = await provider.backup(backup.data, backup.metadata);
              if (!success) {
                console.error(`Provider ${providerName} failed to backup page ${page.name}`);
                pageBackupSuccessful = false;
              }
            } catch (providerError) {
              console.error(`Error with ${providerName} provider:`, providerError);
              pageBackupSuccessful = false;
            }
          }

          if (pageBackupSuccessful) {
            successCount++;

            // Check if page has a file object (which might indicate assets)
            if (page.file && page.file.id) {
              // This page likely contains assets, prioritize searching them
              const assetsInPage = await findAssetsInPage(page.name);

              // Backup each unique asset
              for (const assetPath of assetsInPage) {
                if (!processedAssets.has(assetPath)) {
                  processedAssets.add(assetPath);
                  await this.backupAsset(assetPath);
                }
              }
            }
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error(`Error backing up page ${page.name}:`, error);
          errorCount++;
        }
      }

      // Final summary notification
      let summaryMessage = `Backup completed: ${successCount} pages backed up`;
      if (errorCount > 0) {
        summaryMessage += `, ${errorCount} pages failed`;
      }
      logseq.UI.showMsg(summaryMessage, errorCount > 0 ? 'warning' : 'success');
    } catch (error) {
      console.error('Error during backupAllPages:', error);
      logseq.UI.showMsg(`Error during backup: ${error.message}`, 'error');
    }
  }

  /**
   * Backs up a single asset
   * @param assetPath Path of the asset to backup
   */
  private async backupAsset(assetPath: string): Promise<boolean> {
    try {
      // Implement asset backup logic here
      console.log(`Backing up asset: ${assetPath}`);

      // Example: If assets are just files, you might copy them to a backup location
      // await fileSystem.copy(assetPath, `${backupLocation}/${path.basename(assetPath)}`);

      return true;
    } catch (error) {
      console.error(`Error backing up asset ${assetPath}:`, error);
      return false;
    }
  }
}

/**
 * Exported function for use by index.ts until fully refactored
 */
export async function backupAllPages(settings: Settings) {
  // Initialize providers
  const providers: Record<string, any> = {};
  const enabledProviderNames = getEnabledProviders(settings);

  for (const providerName of enabledProviderNames) {
    try {
      const provider = ProviderRegistry.createProvider(providerName);
      if (provider) {
        await provider.initialize(settings);
        providers[providerName] = provider;
      }
    } catch (error) {
      console.error(`Failed to initialize ${providerName} provider:`, error);
    }
  }

  // Create a temporary backup service
  const backupService = new BackupService(settings);
  Object.defineProperty(backupService, 'providers', { value: providers });

  // Run the backup
  await backupService.backupAllPages();
}
