import { BackupMetadata, ConnectionTestResult } from './provider.interface';
import { BaseBackupProvider } from './base-provider';
import { createClient, WebDAVClient } from 'webdav';

/**
 * WebDAV storage provider
 * Supports Nextcloud, Synology, JianGuoYun (坚果云), and other WebDAV servers
 */
export class WebDAVBackupProvider extends BaseBackupProvider {
    private client: WebDAVClient | null = null;

    constructor() {
        super('webdav', 'WebDAV');
    }

    protected async initializeProvider(): Promise<boolean> {
        try {
            if (!this.settings.webdav_url) {
                console.error('WebDAV URL is required');
                return false;
            }

            this.client = createClient(this.settings.webdav_url, {
                username: this.settings.webdav_username,
                password: this.settings.webdav_password
            });

            console.info(`WebDAV provider initialized with URL: ${this.settings.webdav_url}`);
            return true;
        } catch (error) {
            console.error('Failed to initialize WebDAV provider:', error);
            return false;
        }
    }

    protected async testProviderConnection(): Promise<ConnectionTestResult> {
        if (!this.client) {
            return { success: false, message: 'WebDAV client not initialized' };
        }

        try {
            // Try to get directory contents to verify connection
            await this.client.getDirectoryContents('/');
            return { success: true, message: 'Successfully connected to WebDAV server' };
        } catch (error) {
            return {
                success: false,
                message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    protected generateBackupKey(metadata: BackupMetadata): string {
        const prefix = this.settings.webdav_pathPrefix?.endsWith('/')
            ? this.settings.webdav_pathPrefix
            : `${this.settings.webdav_pathPrefix || 'logseq-backup'}/`;

        if (metadata.filePath) {
            if (metadata.filePath.startsWith(metadata.graphName + '/')) {
                return `${prefix}${metadata.filePath}`;
            } else {
                return `${prefix}${metadata.graphName}/${metadata.filePath}`;
            }
        }

        if (metadata.pageName) {
            if (metadata.pageName.match(/^\d{4}-\d{2}-\d{2}/)) {
                const journalFileName = metadata.pageName.split(' ')[0].replace(/-/g, '_') + '.md';
                return `${prefix}${metadata.graphName}/journals/${journalFileName}`;
            } else {
                const fileName = metadata.pageName.replace(/ /g, '_').toLowerCase() + '.md';
                return `${prefix}${metadata.graphName}/pages/${fileName}`;
            }
        }

        const timestamp = metadata.timestamp.replace(/[:.]/g, '-');
        return `${prefix}${metadata.graphName}/backups/${timestamp}.zip`;
    }

    protected async uploadFile(key: string, data: Uint8Array, metadata: BackupMetadata): Promise<boolean> {
        if (!this.client) {
            throw new Error('WebDAV client not initialized');
        }

        try {
            // Ensure parent directories exist
            const parts = key.split('/');
            let currentPath = '';

            for (let i = 0; i < parts.length - 1; i++) {
                currentPath += '/' + parts[i];
                try {
                    const exists = await this.client.exists(currentPath);
                    if (!exists) {
                        await this.client.createDirectory(currentPath);
                    }
                } catch (error) {
                    // Directory might already exist, continue
                }
            }

            // Determine content type
            let contentType = 'application/octet-stream';
            if (key.endsWith('.md')) {
                contentType = 'text/markdown';
            } else if (key.endsWith('.jpg') || key.endsWith('.jpeg')) {
                contentType = 'image/jpeg';
            } else if (key.endsWith('.png')) {
                contentType = 'image/png';
            } else if (key.endsWith('.pdf')) {
                contentType = 'application/pdf';
            }

            // Upload file
            await this.client.putFileContents('/' + key, data, {
                contentLength: data.byteLength,
                overwrite: true
            });

            console.info(`Backup successfully uploaded to WebDAV: ${key}`);
            return true;
        } catch (error) {
            console.error('Error uploading to WebDAV:', error);
            return false;
        }
    }

    protected async downloadFile(key: string): Promise<Uint8Array | null> {
        if (!this.client) {
            throw new Error('WebDAV client not initialized');
        }

        try {
            const buffer = await this.client.getFileContents('/' + key) as ArrayBuffer;
            return new Uint8Array(buffer);
        } catch (error) {
            console.error('Error downloading from WebDAV:', error);
            return null;
        }
    }

    protected async listFiles(): Promise<BackupMetadata[]> {
        if (!this.client) {
            throw new Error('WebDAV client not initialized');
        }

        try {
            const prefix = this.settings.webdav_pathPrefix || 'logseq-backup';
            const contents = await this.client.getDirectoryContents('/' + prefix, { deep: true });

            const files = Array.isArray(contents) ? contents : [];

            return files
                .filter((item: any) => item.type === 'file' && item.filename.endsWith('.md'))
                .map((item: any) => {
                    const filePath = item.filename.replace('/' + prefix + '/', '');
                    const parts = filePath.split('/');
                    const graphName = parts[0] || 'unknown';
                    const fileName = parts[parts.length - 1];

                    return {
                        timestamp: item.lastmod || new Date().toISOString(),
                        version: '1.0',
                        graphName: graphName,
                        pageName: fileName.replace('.md', '').replace(/_/g, ' '),
                        filePath: filePath,
                        fileName: fileName,
                        size: item.size || 0
                    } as BackupMetadata;
                });
        } catch (error) {
            console.error('Error listing files from WebDAV:', error);
            return [];
        }
    }

    protected async findFileByTimestamp(timestamp: string): Promise<string | null> {
        const backups = await this.listFiles();
        const matching = backups.find(b => b.timestamp === timestamp);
        return matching?.filePath || null;
    }

    protected async deleteFile(key: string): Promise<boolean> {
        if (!this.client) {
            throw new Error('WebDAV client not initialized');
        }

        try {
            await this.client.deleteFile('/' + key);
            console.info(`File deleted from WebDAV: ${key}`);
            return true;
        } catch (error) {
            console.error('Error deleting from WebDAV:', error);
            return false;
        }
    }

    protected async getFileLastModified(key: string): Promise<Date | null> {
        if (!this.client) {
            return null;
        }

        try {
            const stat = await this.client.stat('/' + key);
            if (stat && typeof stat === 'object' && 'lastmod' in stat) {
                return new Date((stat as any).lastmod);
            }
            return null;
        } catch (error) {
            return null;
        }
    }
}
