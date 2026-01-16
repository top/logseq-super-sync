import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin.user';

// The settings schema that will render in Logseq UI
export const settingsSchema: SettingSchemaDesc[] = [
  // ============== General Settings ==============
  {
    key: "header_general",
    type: "heading",
    title: "🔧 General Settings",
    description: "Common backup options that apply to all providers",
    default: null
  },
  {
    key: "backupMode",
    type: "enum",
    title: "Backup Mode",
    description: "Choose what to backup",
    enumChoices: ["all", "tagged"],
    enumPicker: "radio",
    default: "all",
  },
  {
    key: "backupTags",
    type: "string",
    title: "Backup Tags (comma-separated)",
    description: "Only backup pages with these tags. Use comma to separate multiple tags (e.g., 'important, work, personal'). Only applies when Backup Mode is 'tagged'.",
    default: "",
  },
  {
    key: "debounceTime",
    type: "number",
    title: "Wait Time Before Backup (seconds)",
    description: "How long to wait after editing stops before triggering auto-backup",
    default: 15,
  },
  {
    key: "showNotifications",
    type: "boolean",
    title: "Show Backup Notifications",
    description: "Show success/failure notifications after backup",
    default: true,
  },

  // ============== S3 Configuration ==============
  {
    key: "header_s3",
    type: "heading",
    title: "☁️ Amazon S3 / S3-Compatible",
    description: "AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces, etc.",
    default: null,
  },
  {
    key: "s3_enabled",
    type: "boolean",
    title: "Enable S3 Backup",
    description: "Turn on backup to S3 or S3-compatible storage",
    default: false,
  },
  {
    key: "s3_bucketName",
    type: "string",
    title: "Bucket Name",
    description: "Name of your S3 bucket (required)",
    default: "",
  },
  {
    key: "s3_region",
    type: "string",
    title: "Region",
    description: "AWS region (e.g., us-east-1, ap-northeast-1)",
    default: "us-east-1",
  },
  {
    key: "s3_accessKeyId",
    type: "string",
    title: "Access Key ID",
    description: "Your AWS access key ID (required)",
    default: "",
  },
  {
    key: "s3_secretAccessKey",
    type: "string",
    title: "Secret Access Key",
    description: "Your AWS secret access key (required)",
    default: "",
  },
  {
    key: "s3_pathPrefix",
    type: "string",
    title: "Path Prefix",
    description: "Folder path within the bucket (e.g., logseq-backup/)",
    default: "logseq-backup",
  },
  {
    key: "s3_customEndpoint",
    type: "string",
    title: "Custom Endpoint (optional)",
    description: "For S3-compatible services (e.g., https://play.min.io, https://s3.r2.cloudflarestorage.com)",
    default: "",
  },

  // ============== WebDAV Configuration ==============
  {
    key: "header_webdav",
    type: "heading",
    title: "🌐 WebDAV",
    description: "Nextcloud, Synology, 坚果云 (JianGuoYun), ownCloud, etc.",
    default: null,
  },
  {
    key: "webdav_enabled",
    type: "boolean",
    title: "Enable WebDAV Backup",
    description: "Turn on backup to WebDAV server",
    default: false,
  },
  {
    key: "webdav_url",
    type: "string",
    title: "Server URL",
    description: "WebDAV server address (e.g., https://dav.jianguoyun.com/dav/ or https://cloud.example.com/remote.php/dav/files/username/)",
    default: "",
  },
  {
    key: "webdav_username",
    type: "string",
    title: "Username",
    description: "Your WebDAV username (required)",
    default: "",
  },
  {
    key: "webdav_password",
    type: "string",
    title: "Password / App Token",
    description: "Your WebDAV password or app-specific password (required)",
    default: "",
  },
  {
    key: "webdav_pathPrefix",
    type: "string",
    title: "Path Prefix",
    description: "Folder path on the WebDAV server",
    default: "logseq-backup",
  },

  // ============== Local Backup Configuration ==============
  {
    key: "header_local",
    type: "heading",
    title: "💾 Local Backup",
    description: "Backup to local filesystem or external drive",
    default: null,
  },
  {
    key: "local_enabled",
    type: "boolean",
    title: "Enable Local Backup",
    description: "Turn on backup to local filesystem",
    default: false,
  },
  {
    key: "local_path",
    type: "string",
    title: "Backup Path",
    description: "Full path to local backup directory (e.g., /Users/name/Backups/logseq or D:\\Backups\\logseq)",
    default: "",
  },

  // ============== Future Providers (Placeholder) ==============
  {
    key: "header_future",
    type: "heading",
    title: "🚧 Coming Soon",
    description: "FTP, SFTP, Git, and more providers will be available in future versions",
    default: null,
  },
];

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  // General settings
  backupMode: "all",
  backupTags: "",
  debounceTime: 15,
  showNotifications: true,

  // S3 settings
  s3_enabled: false,
  s3_bucketName: "",
  s3_region: "us-east-1",
  s3_accessKeyId: "",
  s3_secretAccessKey: "",
  s3_pathPrefix: "logseq-backup",
  s3_customEndpoint: "",

  // WebDAV settings
  webdav_enabled: false,
  webdav_url: "",
  webdav_username: "",
  webdav_password: "",
  webdav_pathPrefix: "logseq-backup",

  // Local backup settings
  local_enabled: false,
  local_path: "",
};

export interface Settings {
  // General settings
  backupMode: "all" | "tagged";
  backupTags: string;
  debounceTime: number;
  showNotifications: boolean;

  // S3 settings
  s3_enabled: boolean;
  s3_bucketName: string;
  s3_region: string;
  s3_accessKeyId: string;
  s3_secretAccessKey: string;
  s3_pathPrefix: string;
  s3_customEndpoint: string;

  // WebDAV settings
  webdav_enabled: boolean;
  webdav_url: string;
  webdav_username: string;
  webdav_password: string;
  webdav_pathPrefix: string;

  // Local backup settings
  local_enabled: boolean;
  local_path: string;
}

/**
 * Parse backup tags from comma-separated string
 */
export function parseBackupTags(tagsString: string): string[] {
  if (!tagsString || tagsString.trim() === '') {
    return [];
  }
  return tagsString
    .split(',')
    .map(tag => tag.trim().toLowerCase())
    .filter(tag => tag.length > 0);
}

/**
 * Check if a page should be backed up based on settings
 */
export function shouldBackupPage(pageTags: string[], settings: Settings): boolean {
  if (settings.backupMode === 'all') {
    return true;
  }

  const requiredTags = parseBackupTags(settings.backupTags);
  if (requiredTags.length === 0) {
    // No tags specified, backup everything
    return true;
  }

  // Check if page has any of the required tags
  const normalizedPageTags = pageTags.map(t => t.toLowerCase());
  return requiredTags.some(tag => normalizedPageTags.includes(tag));
}

// Helper function to transform flat settings to grouped settings
export function groupProviderSettings(settings: Settings) {
  return {
    general: {
      backupMode: settings.backupMode,
      backupTags: parseBackupTags(settings.backupTags),
      debounceTime: settings.debounceTime,
      showNotifications: settings.showNotifications,
    },
    s3: {
      enabled: settings.s3_enabled,
      bucketName: settings.s3_bucketName,
      region: settings.s3_region,
      accessKeyId: settings.s3_accessKeyId,
      secretAccessKey: settings.s3_secretAccessKey,
      pathPrefix: settings.s3_pathPrefix,
      customEndpoint: settings.s3_customEndpoint,
    },
    webdav: {
      enabled: settings.webdav_enabled,
      url: settings.webdav_url,
      username: settings.webdav_username,
      password: settings.webdav_password,
      pathPrefix: settings.webdav_pathPrefix,
    },
    local: {
      enabled: settings.local_enabled,
      path: settings.local_path,
    },
  };
}

/**
 * Get list of enabled providers based on settings
 * A provider is enabled if:
 * 1. Its enabled toggle is true
 * 2. Required credentials are provided
 */
export function getEnabledProviders(settings: Settings): string[] {
  const enabled: string[] = [];

  // S3: enabled toggle + required fields
  if (settings.s3_enabled &&
    settings.s3_bucketName &&
    settings.s3_accessKeyId &&
    settings.s3_secretAccessKey) {
    enabled.push('s3');
  }

  // WebDAV: enabled toggle + required fields
  if (settings.webdav_enabled &&
    settings.webdav_url &&
    settings.webdav_username &&
    settings.webdav_password) {
    enabled.push('webdav');
  }

  // Local: enabled toggle + path
  if (settings.local_enabled && settings.local_path) {
    enabled.push('local');
  }

  return enabled;
}

/**
 * Validate provider configuration
 * Returns array of validation errors, empty if valid
 */
export function validateProviderConfig(providerName: string, settings: Settings): string[] {
  const errors: string[] = [];

  switch (providerName) {
    case 's3':
      if (!settings.s3_bucketName) errors.push('S3: Bucket name is required');
      if (!settings.s3_accessKeyId) errors.push('S3: Access Key ID is required');
      if (!settings.s3_secretAccessKey) errors.push('S3: Secret Access Key is required');
      break;

    case 'webdav':
      if (!settings.webdav_url) errors.push('WebDAV: Server URL is required');
      if (!settings.webdav_username) errors.push('WebDAV: Username is required');
      if (!settings.webdav_password) errors.push('WebDAV: Password is required');
      break;

    case 'local':
      if (!settings.local_path) errors.push('Local: Backup path is required');
      break;
  }

  return errors;
}