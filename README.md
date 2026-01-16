# Logseq Super Sync

![GitHub License](https://img.shields.io/github/license/top/logseq-super-sync)
![Logseq Plugin](https://img.shields.io/badge/Logseq-Plugin-blue)

![Logseq Super Sync](icon.png)

A Logseq plugin for automatic page backup and synchronization with multiple cloud storage services.

![Screenshot of Logseq Super Sync](screenshot.png)

## Features

### 🚀 Supported Backup Providers

| Provider | Description |
|----------|-------------|
| **☁️ S3** | AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces |
| **🌐 WebDAV** | Nextcloud, Synology, 坚果云 (JianGuoYun), ownCloud |
| **💾 Local** | Backup to local filesystem |

### 📦 Core Features

- **Multiple Providers** - Backup to multiple destinations simultaneously
- **Automatic Sync** - Real-time backup after editing stops (smart debouncing)
- **Tag Filtering** - Backup all pages or only pages with specific tags
- **Linked Assets** - Automatically backup images and attachments
- **File Structure** - Maintains original directory structure (journals/pages/assets)
- **One-Click Backup** - Toolbar button and slash command support

## Installation

### From Marketplace (Recommended)

1. Open Logseq → **...** menu → **Plugins**
2. Search for "Super Sync" and click **Install**

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/top/logseq-super-sync/releases)
2. In Logseq, enable **Developer mode** in Settings
3. Click **Load unpacked plugin** and select the extracted folder

## Configuration

Open Logseq Settings → **Super Sync** to configure:

### 🔧 General Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Backup Mode** | `all` (all pages) or `tagged` (only tagged pages) | `all` |
| **Backup Tags** | Comma-separated tags for tagged mode | - |
| **Wait Time** | Seconds to wait after editing stops | `15` |
| **Show Notifications** | Show backup success/failure messages | `true` |

### ☁️ S3 Configuration

| Setting | Description |
|---------|-------------|
| **Enable** | Toggle S3 backup on/off |
| **Bucket Name** | S3 bucket name (required) |
| **Region** | AWS region (e.g., `us-east-1`) |
| **Access Key ID** | AWS access key (required) |
| **Secret Access Key** | AWS secret key (required) |
| **Path Prefix** | Folder path in bucket |
| **Custom Endpoint** | For S3-compatible services |

### 🌐 WebDAV Configuration

| Setting | Description |
|---------|-------------|
| **Enable** | Toggle WebDAV backup on/off |
| **Server URL** | WebDAV server address |
| **Username** | WebDAV username (required) |
| **Password** | WebDAV password (required) |
| **Path Prefix** | Folder on server |

### 💾 Local Backup

| Setting | Description |
|---------|-------------|
| **Enable** | Toggle local backup on/off |
| **Backup Path** | Full path to backup directory |

## Usage

### Toolbar Button
Click the **📤** icon in the toolbar to start a full backup.

### Slash Commands
Type `/Backup All Pages` in the editor.

### Automatic Backup
Pages are backed up automatically after you stop editing for the configured wait time (default: 15 seconds).

## Troubleshooting

### No data appearing in backup destination

1. **Check if provider is enabled**: Open settings and make sure the "Enable" toggle is ON for your provider
2. **Check browser console**: Press F12 in Logseq and look for `[SuperSync]` messages
   - You should see: `[SuperSync] Initializing with X enabled providers: ['s3']`
   - If you see: `[SuperSync] No providers enabled! Check settings.` - enable the provider in settings

### Common Issues

| Issue | Solution |
|-------|----------|
| "No backup providers enabled" warning | Enable S3/WebDAV/Local toggle in settings |
| S3 upload fails | Check bucket name, credentials, and endpoint (for MinIO) |
| WebDAV fails | Verify URL format and credentials |

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## License

MIT
