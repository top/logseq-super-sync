import { BackupMetadata } from '../providers/provider.interface';
import { Settings, getEnabledProviders } from '../core/settings';
import { createPageBackup, findAssetsInPage, detectTagPage } from '../utils/graph-utils';
import { S3BackupProvider } from '../providers/s3/s3-provider';

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
      switch (providerName) {
        case 's3': {
          const s3Provider = new S3BackupProvider();
          const success = await s3Provider.initialize(this.settings);

          if (success) {
            this.providers.s3 = s3Provider;
            console.info('S3 provider initialized successfully');
          } else {
            console.error('Failed to initialize S3 provider');
          }
          break;
        }
        case 'git':
          // Initialize Git provider when implemented
          console.info('Git provider not yet implemented');
          break;
        case 'local':
          // Initialize Local provider when implemented
          console.info('Local provider not yet implemented');
          break;
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
    if (changes.length === 0 || !this.settings.backupEnabled) return;

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
    if (this.settings.backupTrigger === "automatic" && 
        getEnabledProviders(this.settings).length > 0 && 
        modifiedPages.size > 0) {
      console.info(`Found ${modifiedPages.size} modified pages to backup`);

      try {
        // Backup each modified page
        for (const pageName of modifiedPages) {
          await this.backupPage(pageName);
        }
      } catch (backupError) {
        console.error('Error performing backups:', backupError);
        logseq.App.showMsg('Backup failed. Check console for details.', 'error');
      }
    } else if (modifiedPages.size === 0) {
      console.info('No pages were modified in this change set');
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
        logseq.App.showMsg(`Backup of ${pageName} completed successfully`, 'success');
      } else if (successCount > 0) {
        logseq.App.showMsg(
          `Backup of ${pageName} partially completed (${successCount}/${providerCount} providers)`,
          'warning'
        );
      } else {
        logseq.App.showMsg(`Backup of ${pageName} failed`, 'error');
      }
    } catch (error) {
      console.error(`Error creating backup for page ${pageName}:`, error);
      logseq.App.showMsg(`Backup failed: ${error.message}`, 'error');
    }
  }

  /**
   * Backs up all pages in the current graph
   */
  async backupAllPages(): Promise<void> {
    try {
      // Show progress notification
      logseq.App.showMsg('Starting full vault backup...', 'info');

      // Get all pages
      const allPages = await logseq.Editor.getAllPages();
      if (!allPages || allPages.length === 0) {
        logseq.App.showMsg('No pages found in the current graph', 'warning');
        return;
      }

      console.info(`Found ${allPages.length} pages to back up`);

      // Get enabled providers
      const enabledProviderNames = getEnabledProviders(this.settings);
      if (enabledProviderNames.length === 0) {
        logseq.App.showMsg('No backup providers enabled. Please configure a provider first.', 'warning');
        return;
      }

      // Initialize tracking variables
      let successCount = 0;
      let errorCount = 0;
      let assetCount = 0;

      // Reset processed assets set
      processedAssets.clear();

      // Process each page
      for (let i = 0; i < allPages.length; i++) {
        const page = allPages[i];
        try {
          // Update progress periodically
          if (i % 10 === 0 || i === allPages.length - 1) {
            logseq.App.showMsg(`Backing up pages: ${i + 1} of ${allPages.length}`, 'info');
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

            // Process assets in this page
            const assetsInPage = await findAssetsInPage(page.name);

            // Backup each unique asset
            for (const assetPath of assetsInPage) {
              if (!processedAssets.has(assetPath)) {
                processedAssets.add(assetPath);
                const assetResult = await this.backupAsset(assetPath);
                if (assetResult) {
                  assetCount++;
                }
              }
            }
          } else {
            errorCount++;
          }
        } catch (error) {
          errorCount++;
          console.error(`Error processing page ${page.name}:`, error);
        }
      }

      // Show completion message
      logseq.App.showMsg(
        `Backup complete: ${successCount} pages and ${assetCount} assets backed up successfully. ${errorCount} errors.`,
        errorCount > 0 ? 'warning' : 'success'
      );
    } catch (error) {
      console.error('Error in full backup process:', error);
      logseq.App.showMsg(`Backup failed: ${error.message}`, 'error');
    }
  }

  /**
   * Backs up an asset file
   * @param assetPath Path to the asset file
   * @returns Promise resolving to true if asset backup was successful
   */
  private async backupAsset(assetPath: string): Promise<boolean> {
    try {
      console.debug(`Processing asset: ${assetPath}`);

      // Extract just the filename from the path (remove ./assets/ prefix)
      const fileName = assetPath.replace(/^\.\/assets\//, '');

      // Since Logseq API doesn't provide direct access to asset files,
      // we'll create a placeholder file with info
      const assetContent = new TextEncoder().encode(
        `Asset reference found: ${assetPath}\n` +
        `This is a placeholder. Original asset should be manually copied from your Logseq graph.\n` +
        `Asset referenced at: ${new Date().toISOString()}`
      );

      // Create asset metadata
      const graphInfo = await logseq.App.getCurrentGraph();
      if (!graphInfo) {
        return false;
      }

      const metadata: BackupMetadata = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        graphName: graphInfo.name,
        pageName: 'asset',
        fileType: 'asset',
        filePath: `assets/${fileName}`,
        fileName: fileName,
        size: assetContent.byteLength
      };

      // Back up to all enabled providers
      let allSuccess = true;
      for (const provider of Object.values(this.providers)) {
        try {
          const success = await provider.backup(assetContent, metadata);
          if (!success) {
            console.error(`Failed to backup asset: ${assetPath}`);
            allSuccess = false;
          } else {
            console.debug(`Successfully backed up asset placeholder for: ${assetPath}`);
          }
        } catch (error) {
          console.error(`Error with provider for asset ${assetPath}:`, error);
          allSuccess = false;
        }
      }

      return allSuccess;
    } catch (error) {
      console.error(`Error backing up asset ${assetPath}:`, error);
      return false;
    }
  }

  /**
   * Rotates old backups to maintain the maximum number of backups
   */
  async rotateOldBackups(): Promise<void> {
    const maxBackups = this.settings.maxBackupsToKeep;
    if (maxBackups <= 0) return;

    for (const provider of Object.values(this.providers)) {
      try {
        // Get list of existing backups
        const backups = await provider.listBackups();

        // If we have more than the maximum, delete the oldest ones
        if (backups.length > maxBackups) {
          console.info(`Found ${backups.length} backups, keeping ${maxBackups}`);

          // Sort by timestamp (newest first) and get the ones to delete
          const backupsToDelete = backups.slice(maxBackups);

          for (const backup of backupsToDelete) {
            try {
              console.info(`Deleting old backup from ${backup.timestamp}`);
              await provider.deleteBackup(backup.timestamp);
            } catch (deleteError) {
              console.error(`Failed to delete backup from ${backup.timestamp}:`, deleteError);
            }
          }
        }
      } catch (error) {
        console.error('Error rotating old backups:', error);
      }
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
      if (providerName === 's3') {
        const provider = new S3BackupProvider();
        await provider.initialize(settings);
        providers.s3 = provider;
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