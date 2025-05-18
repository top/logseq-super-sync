import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin.user';

// The settings schema that will render in Logseq UI
export const settingsSchema: SettingSchemaDesc[] = [
  // All existing settings fields remain the same
  // ...
];

// Default settings
export const DEFAULT_SETTINGS = {
  // All existing default settings remain the same
  // ...
};

// Type definitions
export type BackupFrequencyType = "afterEveryChange" | "oncePerHour" | "oncePerDay";

export interface Settings {
  // All existing settings interface properties remain the same
  // ...
};

// Helper function to transform flat settings to grouped settings
export function groupProviderSettings(settings: Settings) {
  // Implementation remains the same
  // ...
}

// Function to determine which providers are enabled based on filled required fields
export function getEnabledProviders(settings: Settings): string[] {
  // Implementation remains the same but remove debug logging
  const enabled: string[] = [];

  // S3 is enabled if required fields are provided
  if (settings.s3_bucketName &&
    settings.s3_accessKeyId &&
    settings.s3_secretAccessKey) {
    enabled.push('s3');
  }

  // Git is enabled if repository URL is provided
  if (settings.git_repoUrl) {
    enabled.push('git');
  }

  // Local is enabled if path is provided
  if (settings.local_path) {
    enabled.push('local');
  }

  return enabled;
}