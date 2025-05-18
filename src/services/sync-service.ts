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
  }
  
  /**
   * Perform initial synchronization on Logseq startup
   */
  async performInitialSync(): Promise<void> {
    console.info('Starting initial synchronization on startup...');
    
    try {
      // Get list of pages to sync
      const pages = await logseq.Editor.getAllPages();
      
      // Compare local and remote versions for each page
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
      // 获取页面内容和元数据
      const page = await logseq.Editor.getPage(pageName);
      if (!page) {
        console.warn(`Page not found: ${pageName}`);
        return;
      }
      
      // 获取页面文件路径
      const filePath = this.getPageFilePath(page);
      if (!filePath) {
        console.warn(`File path not found for page: ${pageName}`);
        return;
      }
      
      const localUpdatedAt = new Date(page.updatedAt);
      
      // 对于每个启用的提供者，执行同步
      for (const [providerName, provider] of this.providers.entries()) {
        // 如果提供者未正确配置，则跳过
        if (!this.isProviderEnabled(providerName)) {
          continue;
        }
        
        // 比较时间戳
        const baseProvider = provider as unknown as BaseBackupProvider;
        const diffResult = await baseProvider.diffWithRemote(filePath, localUpdatedAt);
        
        switch (diffResult) {
          case 'local-newer':
            // 将本地版本推送到远程
            console.log(`Local version of "${pageName}" is newer, pushing to ${providerName}`);
            await this.pushToRemote(provider, pageName, filePath, page.content);
            break;
            
          case 'remote-newer':
            // 将远程版本拉取到本地
            console.log(`Remote version of "${pageName}" is newer on ${providerName}, pulling`);
            await this.pullFromRemote(provider, pageName, filePath);
            break;
            
          case 'same':
            // 文件已同步，无需操作
            console.log(`Page "${pageName}" is already in sync with ${providerName}`);
            break;
            
          case 'remote-missing':
            // 远程没有此文件，推送它
            console.log(`Page "${pageName}" doesn't exist on ${providerName}, pushing`);
            await this.pushToRemote(provider, pageName, filePath, page.content);
            break;
        }
      }
    } catch (error) {
      console.error(`Error synchronizing page "${pageName}":`, error);
    }
  }
  
  /**
   * 根据其配置检查提供者是否启用
   */
  private isProviderEnabled(providerName: string): boolean {
    // 这对每种提供者类型都是特定的
    switch (providerName) {
      case 's3':
        return !!(this.settings.s3_bucketName && 
                 this.settings.s3_accessKeyId && 
                 this.settings.s3_secretAccessKey);
      
      // 其他提供者类型...
        
      default:
        return false;
    }
  }
  
  /**
   * 从页面对象获取文件路径
   */
  private getPageFilePath(page: any): string | null {
    // 注意：这是一个占位符 - 实际实现需要根据Logseq的API
    // 目前Logseq没有直接提供文件路径的API，这需要更复杂的处理
    return page.file?.path || null;
  }
  
  /**
   * 将本地文件推送到远程
   */
  private async pushToRemote(
    provider: BackupProvider, 
    pageName: string, 
    filePath: string,
    content: string
  ): Promise<boolean> {
    try {
      console.info(`Pushing page "${pageName}" to ${provider.name}`);
      
      // 将字符串内容转换为Uint8Array
      const encoder = new TextEncoder();
      const fileContent = encoder.encode(content);
      
      // 准备元数据
      const metadata: BackupMetadata = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        graphName: await this.getGraphName(),
        pageName: pageName,
        fileType: pageName.match(/^\d{4}-\d{2}-\d{2}/) ? 'journal' : 'page',
        filePath: filePath,
        fileName: filePath.split('/').pop() || '',
        size: fileContent.byteLength
      };
      
      // 备份到提供者
      return await provider.backup(fileContent, metadata);
    } catch (error) {
      console.error(`Error pushing page "${pageName}" to ${provider.name}:`, error);
      return false;
    }
  }
  
  /**
   * 将远程文件拉取到本地
   */
  private async pullFromRemote(
    provider: BackupProvider, 
    pageName: string, 
    filePath: string
  ): Promise<boolean> {
    try {
      console.info(`Pulling page "${pageName}" from ${provider.name}`);
      
      // 找出此页面的最新备份
      const backups = await provider.listBackups();
      const pageBackups = backups.filter(b => b.pageName === pageName || b.filePath === filePath)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      if (pageBackups.length === 0) {
        console.warn(`No backups found for page "${pageName}"`);
        return false;
      }
      
      const latestBackup = pageBackups[0];
      
      // 恢复备份
      const fileContent = await provider.restoreBackup(latestBackup.timestamp);
      if (!fileContent) {
        console.error(`Failed to restore backup for page "${pageName}"`);
        return false;
      }
      
      // 将内容解码为字符串
      const decoder = new TextDecoder('utf-8');
      const contentString = decoder.decode(fileContent);
      
      // 更新页面内容
      // 注意：Logseq API 目前不直接支持写入完整页面内容，这是一个占位符
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
  
  /**
   * 获取当前图表名称
   */
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