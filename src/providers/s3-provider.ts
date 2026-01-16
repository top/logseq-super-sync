import { BackupMetadata, ConnectionTestResult } from './provider.interface';
import { BaseBackupProvider } from './base-provider';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand
} from '@aws-sdk/client-s3';

/**
 * S3 compatible storage provider
 */
export class S3BackupProvider extends BaseBackupProvider {
  private s3Client: S3Client;

  constructor() {
    super('s3', 'Amazon S3');
    this.s3Client = {} as S3Client;
  }

  protected async initializeProvider(): Promise<boolean> {
    try {
      const clientConfig: any = {
        region: this.settings.s3_region,
        credentials: {
          accessKeyId: this.settings.s3_accessKeyId,
          secretAccessKey: this.settings.s3_secretAccessKey
        }
      };

      if (this.settings.s3_customEndpoint) {
        console.info(`Using custom S3 endpoint: ${this.settings.s3_customEndpoint}`);
        clientConfig.endpoint = this.settings.s3_customEndpoint;
        clientConfig.forcePathStyle = true;
      }

      this.s3Client = new S3Client(clientConfig);
      console.info(`S3 provider initialized with ${this.settings.s3_customEndpoint ? 'custom endpoint' : 'AWS S3'}`);

      return true;
    } catch (error) {
      console.error('Failed to initialize S3 provider:', error);
      return false;
    }
  }

  protected async testProviderConnection(): Promise<ConnectionTestResult> {
    try {
      const command = new HeadBucketCommand({
        Bucket: this.settings.s3_bucketName
      });
      await this.s3Client.send(command);
      return { success: true, message: `Successfully connected to bucket: ${this.settings.s3_bucketName}` };
    } catch (error) {
      return {
        success: false,
        message: `Failed to connect: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  protected generateBackupKey(metadata: BackupMetadata): string {
    // Get basic path prefix
    const prefix = this.settings.s3_pathPrefix.endsWith('/')
      ? this.settings.s3_pathPrefix
      : `${this.settings.s3_pathPrefix}/`;

    // If file path info is available, use it to match exact directory structure
    if (metadata.filePath) {
      // Avoid duplicating graph name
      if (metadata.filePath.startsWith(metadata.graphName + '/')) {
        return `${prefix}${metadata.filePath}`;
      } else {
        return `${prefix}${metadata.graphName}/${metadata.filePath}`;
      }
    }

    // For older backups or if filePath is unavailable
    if (metadata.pageName) {
      // Check if it's a journal page
      if (metadata.pageName.match(/^\d{4}-\d{2}-\d{2}/)) {
        const journalFileName = metadata.pageName.split(' ')[0].replace(/-/g, '_') + '.md';
        return `${prefix}${metadata.graphName}/journals/${journalFileName}`;
      } else {
        const fileName = metadata.pageName.replace(/ /g, '_').toLowerCase() + '.md';
        return `${prefix}${metadata.graphName}/pages/${fileName}`;
      }
    }

    // Timestamped general backup
    const timestamp = metadata.timestamp.replace(/[:.]/g, '-');
    return `${prefix}${metadata.graphName}/backups/${timestamp}.zip`;
  }

  protected async uploadFile(key: string, data: Uint8Array, metadata: BackupMetadata): Promise<boolean> {
    try {
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

      // Perform actual S3 upload
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
      console.error('Error uploading to S3:', error);
      return false;
    }
  }

  protected async downloadFile(key: string): Promise<Uint8Array | null> {
    try {
      const getCommand = new GetObjectCommand({
        Bucket: this.settings.s3_bucketName,
        Key: key
      });

      const { Body } = await this.s3Client.send(getCommand);

      if (!Body) {
        console.error('Retrieved empty file');
        return null;
      }

      // Convert stream to Uint8Array
      let chunks: Uint8Array[] = [];
      for await (const chunk of Body as any) {
        chunks.push(chunk);
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
      console.error('Error downloading from S3:', error);
      return null;
    }
  }

  protected async listFiles(): Promise<BackupMetadata[]> {
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

  protected async findFileByTimestamp(timestamp: string): Promise<string | null> {
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

      return matchingFile.Key;
    } catch (error) {
      console.error('Error finding backup file by timestamp from S3:', error);
      return null;
    }
  }

  protected async deleteFile(key: string): Promise<boolean> {
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.settings.s3_bucketName,
        Key: key
      });

      await this.s3Client.send(deleteCommand);
      console.info(`File deleted from S3: ${key}`);
      return true;
    } catch (error) {
      console.error('Error deleting from S3:', error);
      return false;
    }
  }

  protected async getFileLastModified(key: string): Promise<Date | null> {
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.settings.s3_bucketName,
        Key: key
      });

      const response = await this.s3Client.send(headCommand);
      return response.LastModified || null;
    } catch (error) {
      if ((error as any).name === 'NotFound') {
        return null;
      }
      console.error('Error getting file last modified from S3:', error);
      throw error;
    }
  }
}