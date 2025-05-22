import JSZip from 'jszip';
import { BackupMetadata } from '../providers/provider.interface';

/**
 * Creates a backup of a specific page
 * @param pageName The name of the page to back up
 * @returns Promise with backup data and metadata, or null if backup fails
 */
export async function createPageBackup(pageName: string): Promise<{ data: Uint8Array, metadata: BackupMetadata } | null> {
  try {
    // Get current graph info
    const graphInfo = await logseq.App.getCurrentGraph();
    if (!graphInfo) {
      throw new Error('No graph is currently open');
    }

    console.info('Creating backup for page:', pageName);

    // Get the page by name
    const page = await logseq.Editor.getPage(pageName);
    if (!page) {
      console.error(`Page not found: ${pageName}`);
      return null;
    }

    // Check if this page is a tag page that should be skipped
    const isTagPage = detectTagPage(page);
    if (isTagPage) {
      console.info(`Skipping tag page: ${pageName}`);
      return null;
    }

    // Determine the actual file path and name
    let filePath = '';
    let fileName = '';

    // Check if it's a journal page (date format) or regular page
    if (page.journalDay) {
      // Journal pages are stored in journals/ with format YYYY_MM_DD.md

      // For journal pages, extract date directly from journalDay
      const journalDayStr = String(page.journalDay);
      const year = journalDayStr.substring(0, 4);
      const month = journalDayStr.substring(4, 6);
      const day = journalDayStr.substring(6, 8);
      fileName = `${year}_${month}_${day}.md`;
      filePath = `journals/${fileName}`;
    } else {
      // Regular pages are stored in pages/ with file-safe versions of their names
      // For simplicity, we'll use the page.name which should be close to the file name
      fileName = `${page.name.replace(/ /g, '_').replace(/[^\w\d_.-]/g, '').toLowerCase()}.md`;
      filePath = `pages/${fileName}`;
      console.debug(`Regular page detected: ${fileName}`);
    }

    // Get page blocks (content)
    const blocks = await logseq.Editor.getPageBlocksTree(pageName);
    if (!blocks) {
      console.error(`No blocks found for page: ${pageName}`);
      return null;
    }

    // Reconstruct page markdown content
    let pageContent = '';

    // Add page properties if they exist
    const properties = page.properties || {};
    if (Object.keys(properties).length > 0) {
      pageContent += '---\n';
      for (const [key, value] of Object.entries(properties)) {
        // Skip internal properties that start with ':'
        if (!key.startsWith(':')) {
          pageContent += `${key}: ${JSON.stringify(value)}\n`;
        }
      }
      pageContent += '---\n\n';
    }

    // Format blocks into markdown
    const formatBlock = (block: any, level = 0): string => {
      let content = '';

      // Add appropriate indentation based on level
      const indent = '  '.repeat(level);

      // Add bullet or numbering
      let prefix = '- ';
      if (block.properties && block.properties.numbered) {
        prefix = '1. ';
      }

      // Add the block content with proper indentation
      content += `${indent}${prefix}${block.content}\n`;

      // Process children recursively
      if (block.children && block.children.length > 0) {
        for (const child of block.children) {
          content += formatBlock(child, level + 1);
        }
      }

      return content;
    };

    // Process top-level blocks
    for (const block of blocks) {
      pageContent += formatBlock(block);
    }

    // Create a ZIP file to maintain directory structure
    const zip = new JSZip();

    // Add the page content to the zip using the correct path
    zip.file(filePath, pageContent);

    // Add manifest with backup info
    const timestamp = new Date().toISOString();
    const metadata: BackupMetadata = {
      timestamp: timestamp,
      version: '1.0',
      graphName: graphInfo.name,
      pageName: pageName,
      fileType: page['journal?'] ? 'journal' : 'page',
      filePath: filePath,
      fileName: fileName,
      journalDay: page.journalDay?.toString() || undefined,
      size: 0 // Will be updated after compression
    };

    zip.file('manifest.json', JSON.stringify(metadata, null, 2));

    // Generate the zip file as a Uint8Array
    const zipData = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9 // Maximum compression
      }
    });

    // Update the size in metadata
    metadata.size = zipData.byteLength;

    console.info(`Successfully created backup for ${filePath} (${zipData.byteLength} bytes)`);

    return {
      data: zipData,
      metadata
    };
  } catch (error) {
    console.error('Error creating page backup:', error);
    throw error;
  }
}

/**
 * Finds assets referenced in a page
 * @param pageName The name of the page to scan for assets
 * @returns Promise with array of asset paths
 */
export async function findAssetsInPage(pageName: string): Promise<string[]> {
  const assets: string[] = [];

  try {
    // Get page content as blocks
    const blocks = await logseq.Editor.getPageBlocksTree(pageName);
    if (!blocks) return assets;

    // Function to recursively search for asset references in blocks
    const findAssetsInBlock = (block: any) => {
      if (!block.content) return;

      // Look for various asset reference patterns

      // 1. Markdown image syntax: ![alt](./assets/file.jpg)
      const mdImageRegex = /!\[.*?\]\((\.\/assets\/[^)]+)\)/g;
      let match;

      while ((match = mdImageRegex.exec(block.content)) !== null) {
        const assetPath = match[1].trim();
        assets.push(assetPath);
      }

      // 2. Look for Logseq asset references: ![[file:/assets/image.png]]
      const logseqAssetRegex = /!\[\[file:\/?\/?assets\/([^\]]+)\]\]/g;
      while ((match = logseqAssetRegex.exec(block.content)) !== null) {
        assets.push(`./assets/${match[1].trim()}`);
      }

      // 3. Look for other asset references
      const assetRegex = /\[\[asset:([^\]]+)\]\]/g;
      while ((match = assetRegex.exec(block.content)) !== null) {
        const assetPath = match[1].trim();
        assets.push(`./assets/${assetPath}`);
      }

      // 4. Look for direct asset links without markdown syntax: assets/image.png
      const directAssetRegex = /[^(!\[)]\bassets\/([^\s\)\"\']+)/g;
      while ((match = directAssetRegex.exec(block.content)) !== null) {
        assets.push(`./assets/${match[1].trim()}`);
      }

      // Check for children
      if (block.children && block.children.length > 0) {
        for (const child of block.children) {
          findAssetsInBlock(child);
        }
      }
    };

    // Process each top-level block
    for (const block of blocks) {
      findAssetsInBlock(block);
    }

    // Remove duplicates and normalize paths
    return [...new Set(assets)].map(path => {
      // Ensure path starts with ./assets/
      if (!path.startsWith('./assets/')) {
        return `./assets/${path.replace(/^assets\//, '')}`;
      }
      return path;
    });
  } catch (error) {
    console.error(`Error finding assets in page ${pageName}:`, error);
  }

  return assets;
}

/**
 * Helper function to detect if a page is a tag
 * @param page The page object to check
 * @returns True if the page is a tag page
 */
export function detectTagPage(page: any): boolean {
  // Case 1: Page name starts with '#'
  if (page.name && page.name.startsWith('#')) {
    return true;
  }

  // Case 2: Page's original name starts with '#'
  if (page.originalName && page.originalName.startsWith('#')) {
    return true;
  }

  // Case 3: Page has tag-specific properties
  if (page.properties) {
    // If it has a "tags" property itself, it's likely a tag collection page
    if (page.properties.tags) {
      return true;
    }

    // Pages with ':namespace' or other tag-specific properties
    if (page.properties[':namespace']) {
      return true;
    }
  }

  // Case 4: Special system tag pages
  const tagPageNames = ['tags', 'tag', 'all-tags', 'all-pages'];
  if (page.name && tagPageNames.includes(page.name.toLowerCase())) {
    return true;
  }

  return false;
}