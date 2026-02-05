/**
 * Databricks Volume Storage Service
 *
 * Handles file storage in Databricks Unity Catalog Volumes using the Files API.
 * Volumes provide persistent, scalable storage for chat file attachments.
 */

import { createHash } from 'node:crypto';
import {
  getDatabricksToken,
  getAuthMethod,
  getCachedCliHost,
} from '@chat-template/auth';
import { getHostUrl } from '@chat-template/utils';

export interface VolumeConfig {
  catalog: string;
  schema: string;
  volume: string;
}

export interface VolumeFile {
  volumePath: string;
  volumeCatalog: string;
  volumeSchema: string;
  volumeName: string;
  checksum: string;
}

export interface UploadOptions {
  chatId?: string;
  projectId?: string;
  userId?: string;
  fileId: string;
}

/**
 * Get volume configuration from environment variables
 */
function getVolumeConfig(): VolumeConfig | null {
  const catalog = process.env.VOLUME_CATALOG;
  const schema = process.env.VOLUME_SCHEMA;
  const volume = process.env.VOLUME_NAME;

  if (!catalog || !schema || !volume) {
    return null;
  }

  return { catalog, schema, volume };
}

/**
 * Check if volume storage is configured and available
 */
export function isVolumeStorageAvailable(): boolean {
  return getVolumeConfig() !== null;
}

/**
 * Get the Databricks host URL for API calls
 */
function getDatabricksHostUrl(): string {
  const method = getAuthMethod();

  if (method === 'cli') {
    const cachedHost = getCachedCliHost();
    if (cachedHost) {
      return cachedHost;
    }
  }

  return getHostUrl();
}

/**
 * Build the volume path for a file using the hierarchical directory structure:
 *
 * /Volumes/{catalog}/{schema}/{volume}/
 * ├── users/
 * │   └── {userId}/
 * │       ├── chats/
 * │       │   └── {chatId}/
 * │       │       └── {fileId}/
 * │       │           └── {filename}
 * │       └── orphan-files/           # Files not yet associated with a chat
 * │           └── {fileId}/
 * │               └── {filename}
 * ├── projects/
 * │   └── {projectId}/
 * │       └── files/
 * │           └── {fileId}/
 * │               └── {filename}
 * └── shared/
 *     └── templates/                  # Future: org-wide templates
 */
function buildVolumePath(
  config: VolumeConfig,
  options: UploadOptions,
  filename: string,
): string {
  const { chatId, projectId, userId, fileId } = options;
  const base = `/Volumes/${config.catalog}/${config.schema}/${config.volume}`;

  // Project file - shared across project chats
  if (projectId) {
    return `${base}/projects/${projectId}/files/${fileId}/${filename}`;
  }

  // Chat-specific file with user scoping
  if (chatId && userId) {
    return `${base}/users/${userId}/chats/${chatId}/${fileId}/${filename}`;
  }

  // Chat file without user (backwards compatibility)
  if (chatId) {
    return `${base}/chats/${chatId}/files/${fileId}/${filename}`;
  }

  // Orphan file (not yet associated with chat, but has user)
  if (userId) {
    return `${base}/users/${userId}/orphan-files/${fileId}/${filename}`;
  }

  // Fallback to temp storage (no context available)
  return `${base}/temp/${fileId}/${filename}`;
}

/**
 * Calculate SHA-256 checksum for integrity verification
 */
function calculateChecksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Databricks Volume Storage class
 */
export class DatabricksVolumeStorage {
  private config: VolumeConfig;

  constructor() {
    const config = getVolumeConfig();
    if (!config) {
      throw new Error(
        'Volume storage not configured. Set VOLUME_CATALOG, VOLUME_SCHEMA, and VOLUME_NAME environment variables.',
      );
    }
    this.config = config;
  }

  /**
   * Upload a file to Databricks Volume
   */
  async uploadFile(
    buffer: Buffer,
    filename: string,
    options: UploadOptions,
  ): Promise<VolumeFile> {
    const volumePath = buildVolumePath(this.config, options, filename);
    const checksum = calculateChecksum(buffer);

    const hostUrl = getDatabricksHostUrl();
    const token = await getDatabricksToken();

    // The Files API path starts after /Volumes/
    const apiPath = volumePath.replace('/Volumes/', '');
    const url = `${hostUrl}/api/2.0/fs/files/Volumes/${apiPath}?overwrite=true`;

    console.log(`[VolumeStorage] Uploading file to: ${volumePath}`);

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
      },
      body: buffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to upload file to volume: ${response.status} ${errorText}`,
      );
    }

    console.log(
      `[VolumeStorage] File uploaded successfully: ${volumePath} (${buffer.length} bytes)`,
    );

    return {
      volumePath,
      volumeCatalog: this.config.catalog,
      volumeSchema: this.config.schema,
      volumeName: this.config.volume,
      checksum,
    };
  }

  /**
   * Download a file from Databricks Volume
   */
  async downloadFile(volumePath: string): Promise<Buffer> {
    const hostUrl = getDatabricksHostUrl();
    const token = await getDatabricksToken();

    // The Files API path starts after /Volumes/
    const apiPath = volumePath.replace('/Volumes/', '');
    const url = `${hostUrl}/api/2.0/fs/files/Volumes/${apiPath}`;

    console.log(`[VolumeStorage] Downloading file from: ${volumePath}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to download file from volume: ${response.status} ${errorText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(
      `[VolumeStorage] File downloaded successfully: ${volumePath} (${buffer.length} bytes)`,
    );

    return buffer;
  }

  /**
   * Delete a file from Databricks Volume
   */
  async deleteFile(volumePath: string): Promise<void> {
    const hostUrl = getDatabricksHostUrl();
    const token = await getDatabricksToken();

    // The Files API path starts after /Volumes/
    const apiPath = volumePath.replace('/Volumes/', '');
    const url = `${hostUrl}/api/2.0/fs/files/Volumes/${apiPath}`;

    console.log(`[VolumeStorage] Deleting file: ${volumePath}`);

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      // 404 is okay - file may already be deleted
      if (response.status !== 404) {
        throw new Error(
          `Failed to delete file from volume: ${response.status} ${errorText}`,
        );
      }
    }

    console.log(`[VolumeStorage] File deleted successfully: ${volumePath}`);
  }

  /**
   * Check if a file exists in the Volume
   */
  async fileExists(volumePath: string): Promise<boolean> {
    const hostUrl = getDatabricksHostUrl();
    const token = await getDatabricksToken();

    // Use HEAD request to check existence without downloading
    const apiPath = volumePath.replace('/Volumes/', '');
    const url = `${hostUrl}/api/2.0/fs/files/Volumes/${apiPath}`;

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get the volume configuration
   */
  getConfig(): VolumeConfig {
    return { ...this.config };
  }
}

/**
 * Get a singleton instance of the volume storage
 * Returns null if volume storage is not configured
 */
let volumeStorageInstance: DatabricksVolumeStorage | null = null;

export function getVolumeStorage(): DatabricksVolumeStorage | null {
  if (!isVolumeStorageAvailable()) {
    return null;
  }

  if (!volumeStorageInstance) {
    try {
      volumeStorageInstance = new DatabricksVolumeStorage();
    } catch (error) {
      console.warn('[VolumeStorage] Failed to initialize:', error);
      return null;
    }
  }

  return volumeStorageInstance;
}
