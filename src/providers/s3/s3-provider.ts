import { BackupProvider, BackupMetadata } from '../provider.interface';
import { Settings } from '../../core/settings';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';

/**
 * Provider for S3-compatible storage services
 */
export class S3BackupProvider implements BackupProvider {
  name = 's3';
  private s3Client: S3Client;
  private initialized = false;
  private settings: Settings;

  constructor() {
    this.settings = {} as Settings;
    this.s3Client = {} as S3Client;
  }

  async initialize(settings: Settings): Promise<boolean> {
    try {
      this.settings = settings;

      const clientConfig: any = {
        region: settings.s3_region,
        credentials: {
          accessKeyId: settings.s3_accessKeyId,
          secretAccessKey: settings.s3_secretAccessKey
        }
      };

      // Add custom endpoint for MinIO or other S3-compatible services
      if (settings.s3_customEndpoint) {
        console.info(`Using custom S3 endpoint: ${settings.s3_customEndpoint}`);
        clientConfig.endpoint = settings.s3_customEndpoint;
        clientConfig.forcePathStyle = true; // Needed for MinIO and other S3 compatible services
      }

      // Initialize the S3 client
      this.s3Client = new S3Client(clientConfig);

      console.info(`S3 provider initialized with ${settings.s3_customEndpoint ? 'custom endpoint' : 'AWS S3'}`);
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize S3 provider:', error);
      return false;
    }
  }

  async backup(data: Uint8Array, metadata: BackupMetadata): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('S3 provider not initialized');
    }

    try {
      const key = this.generateBackupKey(metadata);

      // Proceed with upload directly without file existence check
      console.info(`Backing up to ${this.settings.s3_customEndpoint ? 'custom S3' : 'AWS S3'}:`, {
        bucketName: this.settings.s3_bucketName,
        region: this.settings.s3_region,
        key: key,
        size: data.length,
      });

      // Determine content type based on file path
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

      // Perform the actual S3 upload
      const command = new PutObjectCommand({
        Bucket: this.settings.s3_bucketName,
        Key: key,
        Body: data,
        ContentType: contentType,
        Metadata: {
          'graph-name': metadata.graphName,
          'backup-version': metadata.version,
          'timestamp': metadata.timestamp
        }
      });

      await this.s3Client.send(command);
      console.info(`Backup successfully uploaded to S3: ${key}`);
      return true;
    } catch (error) {
      console.error('Error backing up to S3:', error);
      return false;
    }
  }

  private generateBackupKey(metadata: BackupMetadata): string {
    // Get the base path prefix
    const prefix = this.settings.s3_pathPrefix.endsWith('/')
      ? this.settings.s3_pathPrefix
      : `${this.settings.s3_pathPrefix}/`;

    // If we have file path information, use that for exact directory structure matching
    if (metadata.filePath) {
      // Create a path like: prefix/graphName/journals/2021_12_31.md
      // or prefix/graphName/pages/my_page.md
      return `${prefix}${metadata.graphName}/${metadata.filePath}`;
    }

    // Fallback for older backups or if filePath is not available
    if (metadata.pageName) {
      // Check if it's likely a journal page by name format
      if (metadata.pageName.match(/^\d{4}-\d{2}-\d{2}/)) {
        // Convert from display format (2021-12-31) to file format (2021_12_31.md)
        const journalFileName = metadata.pageName.split(' ')[0].replace(/-/g, '_') + '.md';
        return `${prefix}${metadata.graphName}/journals/${journalFileName}`;
      } else {
        // Regular page - convert display name to filename format
        const fileName = metadata.pageName.replace(/ /g, '_').toLowerCase() + '.md';
        return `${prefix}${metadata.graphName}/pages/${fileName}`;
      }
    }

    // Generic backup with timestamp
    const timestamp = metadata.timestamp.replace(/[:.]/g, '-');
    return `${prefix}${metadata.graphName}/backups/${timestamp}.zip`;
  }

  async listBackups(): Promise<BackupMetadata[]> {
    if (!this.initialized) {
      throw new Error('S3 provider not initialized');
    }

    try {
      const prefix = this.settings.s3_pathPrefix.endsWith('/')
        ? this.settings.s3_pathPrefix
        : `${this.settings.s3_pathPrefix}/`;

      const command = new ListObjectsV2Command({
        Bucket: this.settings.s3_bucketName,
        Prefix: prefix
      });

      const response = await this.s3Client.send(command);

      if (!response.Contents) {
        return [];
      }

      return response.Contents
        .filter(item => item.Key && item.Key.endsWith('.zip'))
        .map(item => {
          const keyParts = item.Key!.split('/');
          const filename = keyParts[keyParts.length - 1];
          const graphName = keyParts[keyParts.length - 2] || 'unknown';
          const timestamp = filename.replace('.zip', '').replace(/-/g, ':');

          return {
            timestamp: timestamp,
            version: '1.0',
            graphName: graphName,
            pageName: '',  // Not available from S3 metadata
            size: item.Size || 0
          };
        })
        .sort((a, b) => {
          // Sort most recent first
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
    } catch (error) {
      console.error('Error listing backups from S3:', error);
      return [];
    }
  }

  async restoreBackup(timestamp: string): Promise<Uint8Array | null> {
    if (!this.initialized) {
      throw new Error('S3 provider not initialized');
    }

    try {
      // Convert timestamp format back to key format
      const formattedTimestamp = timestamp.replace(/[:.]/g, '-');
      const prefix = this.settings.s3_pathPrefix.endsWith('/')
        ? this.settings.s3_pathPrefix
        : `${this.settings.s3_pathPrefix}/`;

      // List objects to find the correct backup file
      const listCommand = new ListObjectsV2Command({
        Bucket: this.settings.s3_bucketName,
        Prefix: prefix
      });

      const listResponse = await this.s3Client.send(listCommand);

      if (!listResponse.Contents) {
        console.error('No backups found');
        return null;
      }

      // Find the matching backup file
      const matchingFile = listResponse.Contents.find(item =>
        item.Key && item.Key.includes(formattedTimestamp)
      );

      if (!matchingFile || !matchingFile.Key) {
        console.error(`No backup found for timestamp: ${timestamp}`);
        return null;
      }

      // Retrieve the backup file
      const getCommand = new GetObjectCommand({
        Bucket: this.settings.s3_bucketName,
        Key: matchingFile.Key
      });

      const { Body } = await this.s3Client.send(getCommand);

      if (!Body) {
        console.error('Retrieved empty backup file');
        return null;
      }

      // Convert stream to Uint8Array
      let chunks: Uint8Array[] = [];
      const reader = Body.getReader();
      let done, value;

      while (!done) {
        ({ done, value } = await reader.read());
        if (value) {
          chunks.push(value);
        }
      }

      // Concatenate chunks
      let totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      let result = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result;
    } catch (error) {
      console.error('Error restoring backup from S3:', error);
      return null;
    }
  }

  async deleteBackup(timestamp: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('S3 provider not initialized');
    }

    try {
      // Convert timestamp format back to key format
      const formattedTimestamp = timestamp.replace(/[:.]/g, '-');
      const prefix = this.settings.s3_pathPrefix.endsWith('/')
        ? this.settings.s3_pathPrefix
        : `${this.settings.s3_pathPrefix}/`;

      // List objects to find the correct backup file
      const listCommand = new ListObjectsV2Command({
        Bucket: this.settings.s3_bucketName,
        Prefix: prefix
      });

      const listResponse = await this.s3Client.send(listCommand);

      if (!listResponse.Contents) {
        console.error('No backups found');
        return false;
      }

      // Find the matching backup file
      const matchingFile = listResponse.Contents.find(item =>
        item.Key && item.Key.includes(formattedTimestamp)
      );

      if (!matchingFile || !matchingFile.Key) {
        console.error(`No backup found for timestamp: ${timestamp}`);
        return false;
      }

      // Delete the backup file
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.settings.s3_bucketName,
        Key: matchingFile.Key
      });

      await this.s3Client.send(deleteCommand);
      console.info(`Backup deleted: ${matchingFile.Key}`);

      return true;
    } catch (error) {
      console.error('Error deleting backup from S3:', error);
      return false;
    }
  }
}