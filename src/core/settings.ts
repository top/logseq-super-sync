import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin.user';

// The settings schema that will render in Logseq UI
export const settingsSchema: SettingSchemaDesc[] = [
  {
    key: "pluginInfo",
    type: "heading",
    title: "Super Sync",
    description: "Automatic backup and sync for your Logseq graph to cloud storage",
    default: null,
    icon: "ti ti-cloud-upload"
  },
  {
    key: "debounceTime",
    type: "number",
    title: "Wait time before backup (seconds)",
    description: "How long to wait after changes before triggering a backup",
    default: 5,
  },
  {
    key: "separator1",
    type: "heading",
    title: "S3 Configuration",
    description: "Settings for Amazon S3 or compatible services",
    default: "",
  },
  {
    key: "s3_bucketName",
    type: "string",
    title: "S3 Bucket Name",
    description: "Name of your S3 bucket",
    default: "",
  },
  {
    key: "s3_region",
    type: "string",
    title: "S3 Region",
    description: "AWS region (e.g., us-east-1)",
    default: "us-east-1",
  },
  {
    key: "s3_accessKeyId",
    type: "string",
    title: "S3 Access Key ID",
    description: "Your AWS access key ID",
    default: "",
  },
  {
    key: "s3_secretAccessKey",
    type: "string",
    title: "S3 Secret Access Key",
    description: "Your AWS secret access key",
    inputAs: "password",
    default: "",
  },
  {
    key: "s3_pathPrefix",
    type: "string",
    title: "S3 Path Prefix (optional)",
    description: "Folder path within the bucket (e.g., logseq-backup/)",
    default: "logseq-backup",
  },
  {
    key: "s3_customEndpoint",
    type: "string",
    title: "S3 Custom Endpoint (optional)",
    description: "For S3-compatible services like MinIO (e.g., https://play.min.io)",
    default: "",
  },
  // {
  //   key: "separator2",
  //   type: "heading",
  //   title: "Git Configuration",
  //   description: "Settings for Git repository backup",
  // },
  // {
  //   key: "git_repoUrl",
  //   type: "string",
  //   title: "Git Repository URL",
  //   description: "URL of your Git repository (e.g., https://github.com/username/repo.git)",
  //   default: "",
  // },
  // {
  //   key: "git_branch",
  //   type: "string",
  //   title: "Git Branch",
  //   description: "Branch to use for backups",
  //   default: "main",
  // },
  // {
  //   key: "git_username",
  //   type: "string",
  //   title: "Git Username",
  //   description: "Git username for authentication",
  //   default: "",
  // },
  // {
  //   key: "git_token",
  //   type: "string",
  //   title: "Git Personal Access Token",
  //   description: "Token for authentication (for GitHub/GitLab)",
  //   inputAs: "password",
  //   default: "",
  // },
  // {
  //   key: "separator3",
  //   type: "heading",
  //   title: "Local Backup Configuration",
  //   description: "Settings for local filesystem backup",
  //   default: "",
  // },
  // {
  //   key: "local_path",
  //   type: "string",
  //   title: "Local Backup Path",
  //   description: "Path to local backup directory",
  //   default: "",
  // },
];

// Default settings
export const DEFAULT_SETTINGS = {
  debounceTime: 5,

  // S3 settings
  s3_bucketName: "",
  s3_region: "us-east-1",
  s3_accessKeyId: "",
  s3_secretAccessKey: "",
  s3_pathPrefix: "logseq-backup",
  s3_customEndpoint: "",

  // Git settings
  // git_repoUrl: "",
  // git_branch: "main",
  // git_username: "",
  // git_token: "",

  // Local backup settings
  // local_path: ""
};

export interface Settings {
  debounceTime: number;

  // S3 settings
  s3_bucketName: string;
  s3_region: string;
  s3_accessKeyId: string;
  s3_secretAccessKey: string;
  s3_pathPrefix: string;
  s3_customEndpoint: string;

  // Git settings
  // git_repoUrl: string;
  // git_branch: string;
  // git_username: string;
  // git_token: string;

  // Local backup settings
  // local_path: string;
}

// Helper function to transform flat settings to grouped settings
export function groupProviderSettings(settings: Settings) {
  return {
    general: {
      debounceTime: settings.debounceTime,
    },
    s3: {
      bucketName: settings.s3_bucketName,
      region: settings.s3_region,
      accessKeyId: settings.s3_accessKeyId,
      secretAccessKey: settings.s3_secretAccessKey,
      pathPrefix: settings.s3_pathPrefix,
      customEndpoint: settings.s3_customEndpoint,
    },
    // git: {
    //   repoUrl: settings.git_repoUrl,
    //   branch: settings.git_branch,
    //   username: settings.git_username,
    //   token: settings.git_token,
    // },
    // local: {
    //   path: settings.local_path,
    // }
  };
}

// Function to determine which providers are enabled based on filled required fields
export function getEnabledProviders(settings: Settings): string[] {
  const enabled: string[] = [];

  // S3 is enabled if required fields are provided
  if (settings.s3_bucketName &&
    settings.s3_accessKeyId &&
    settings.s3_secretAccessKey) {
    enabled.push('s3');
  }

  // Git is enabled if repository URL is provided
  // if (settings.git_repoUrl) {
  //   enabled.push('git');
  // }

  // Local is enabled if path is provided
  // if (settings.local_path) {
  //   enabled.push('local');
  // }

  return enabled;
}