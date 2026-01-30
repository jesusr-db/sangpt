# Databricks Volumes Migration Plan

## Executive Summary

Migrate file storage from PostgreSQL database (storing files as base64/text) to Databricks Volumes with database pointers, improving scalability, performance, and cost-effectiveness.

## Current Architecture Issues

### Problems with Database Storage
1. **Size Limitations**
   - Base64 encoding adds ~33% overhead
   - Large files bloat database size
   - Backup/restore times increase linearly with file storage
   - Database row size limits (1GB in PostgreSQL)

2. **Performance Impact**
   - Slower queries when tables contain large BLOB data
   - Memory pressure on database connections
   - Network overhead transferring large base64 strings
   - No streaming support for large files

3. **Cost Inefficiency**
   - Database storage is 10-50x more expensive than object storage
   - Compute resources wasted on base64 encoding/decoding
   - Increased backup storage costs

4. **Integration Limitations**
   - Cannot directly use files with Databricks ML/Spark
   - No native file preview capabilities
   - Complex to implement file versioning

## Proposed Architecture with Databricks Volumes

### Overview
```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Client     │◄────►│   Server     │◄────►│  PostgreSQL  │
│              │      │              │      │              │
└──────────────┘      └──────┬───────┘      └──────────────┘
                             │                     ▲
                             │                     │
                             ▼                     │
                    ┌──────────────┐              │
                    │  Databricks  │              │
                    │   Volumes    │              │
                    │              │──────────────┘
                    └──────────────┘         (pointers)
```

### Storage Layout in Volumes
```
/Volumes/main/default/project-files/
├── projects/
│   ├── {project-id}/
│   │   ├── files/
│   │   │   ├── {file-id}/
│   │   │   │   ├── content          # Actual file
│   │   │   │   └── metadata.json   # File metadata
│   │   │   └── index.json          # File listing
│   │   ├── contexts/
│   │   │   └── {context-id}.md     # Project instructions
│   │   └── exports/
│   │       └── {timestamp}/        # Project exports
│   └── _shared/
│       ├── templates/               # Reusable templates
│       └── thumbnails/              # Generated previews
├── chats/
│   └── {chat-id}/
│       └── files/
│           └── {file-id}/
└── temp/
    └── uploads/                     # Temporary upload directory
```

## Implementation Plan

### Phase 1: Infrastructure Setup (Week 1)

#### 1.1 Create Volumes
```sql
-- Create catalog and schema if not exists
CREATE CATALOG IF NOT EXISTS main;
CREATE SCHEMA IF NOT EXISTS main.project_files;

-- Create external volume
CREATE VOLUME IF NOT EXISTS main.project_files.storage
COMMENT 'Storage for project and chat files';
```

#### 1.2 Update Databricks Bundle
```yaml
# databricks.yml
resources:
  volumes:
    project_files_volume:
      catalog_name: main
      schema_name: ${var.catalog_schema}
      name: project-files
      volume_type: MANAGED
      comment: "File storage for projects and chats"

  grants:
    volume_usage:
      volume: ${resources.volumes.project_files_volume.id}
      principal: ${var.service_principal_id}
      privileges:
        - READ_VOLUME
        - WRITE_VOLUME
```

#### 1.3 Database Schema Updates
```sql
-- Add columns for volume storage
ALTER TABLE "ai_chatbot"."FileUpload"
ADD COLUMN IF NOT EXISTS volume_path TEXT,
ADD COLUMN IF NOT EXISTS volume_catalog TEXT DEFAULT 'main',
ADD COLUMN IF NOT EXISTS volume_schema TEXT DEFAULT 'project_files',
ADD COLUMN IF NOT EXISTS volume_name TEXT DEFAULT 'storage',
ADD COLUMN IF NOT EXISTS storage_type VARCHAR(20) DEFAULT 'database',
ADD COLUMN IF NOT EXISTS file_checksum TEXT,
ADD COLUMN IF NOT EXISTS cached_until TIMESTAMP;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_file_upload_volume_path
ON "ai_chatbot"."FileUpload"(volume_path)
WHERE storage_type = 'volume';

-- Migration tracking table
CREATE TABLE IF NOT EXISTS "ai_chatbot"."FileMigration" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES "ai_chatbot"."FileUpload"(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);
```

### Phase 2: Volume Storage Service (Week 1-2)

#### 2.1 Core Service Implementation
```typescript
// server/src/services/volume-storage.ts
import { WorkspaceClient } from '@databricks/sdk';
import crypto from 'crypto';

export interface VolumeFile {
  path: string;
  catalog: string;
  schema: string;
  volume: string;
  checksum: string;
}

export class DatabricksVolumeStorage {
  private client: WorkspaceClient;

  constructor() {
    this.client = new WorkspaceClient({
      host: process.env.DATABRICKS_HOST,
      token: process.env.DATABRICKS_TOKEN,
    });
  }

  async uploadFile(
    buffer: Buffer,
    fileName: string,
    projectId?: string
  ): Promise<VolumeFile> {
    const fileId = generateUUID();
    const checksum = crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');

    const volumePath = projectId
      ? `/projects/${projectId}/files/${fileId}/${fileName}`
      : `/temp/uploads/${fileId}/${fileName}`;

    const fullPath = `/Volumes/main/project_files/storage${volumePath}`;

    // Upload to volume
    await this.client.files.upload(fullPath, buffer);

    return {
      path: volumePath,
      catalog: 'main',
      schema: 'project_files',
      volume: 'storage',
      checksum,
    };
  }

  async readFile(volumePath: string): Promise<Buffer> {
    const fullPath = `/Volumes/main/project_files/storage${volumePath}`;
    return await this.client.files.download(fullPath);
  }

  async deleteFile(volumePath: string): Promise<void> {
    const fullPath = `/Volumes/main/project_files/storage${volumePath}`;
    await this.client.files.delete(fullPath);
  }

  async moveFile(
    sourcePath: string,
    destPath: string
  ): Promise<void> {
    const sourceFullPath = `/Volumes/main/project_files/storage${sourcePath}`;
    const destFullPath = `/Volumes/main/project_files/storage${destPath}`;

    // Copy then delete (Volumes don't support move directly)
    const buffer = await this.client.files.download(sourceFullPath);
    await this.client.files.upload(destFullPath, buffer);
    await this.client.files.delete(sourceFullPath);
  }

  async listFiles(directoryPath: string): Promise<string[]> {
    const fullPath = `/Volumes/main/project_files/storage${directoryPath}`;
    const files = await this.client.files.list(fullPath);
    return files.map(f => f.path);
  }

  async getPresignedUrl(
    volumePath: string,
    expiresIn: number = 3600
  ): Promise<string> {
    // Generate temporary signed URL for direct download
    // This requires setting up a serving endpoint
    return await this.generateSignedUrl(volumePath, expiresIn);
  }
}
```

#### 2.2 File Service Updates
```typescript
// server/src/services/file-service.ts
export class FileService {
  private volumeStorage: DatabricksVolumeStorage;
  private sessionMemory: SessionMemory;

  async uploadFile(
    file: Express.Multer.File,
    chatId: string,
    projectId?: string
  ): Promise<FileUpload> {
    // Process file
    const processed = await FileProcessor.processFile(file);

    // Determine storage strategy based on file size
    const useVolumeStorage = file.size > 100 * 1024; // 100KB threshold

    if (useVolumeStorage) {
      // Upload to volume
      const volumeFile = await this.volumeStorage.uploadFile(
        file.buffer,
        file.originalname,
        projectId
      );

      // Save pointer in database
      return await saveFileUpload({
        filename: file.originalname,
        contentType: file.mimetype,
        fileSize: file.size,
        volume_path: volumeFile.path,
        storage_type: 'volume',
        file_checksum: volumeFile.checksum,
        extractedContent: processed.extractedContent,
        metadata: processed.metadata,
      });
    } else {
      // Small files stay in database for performance
      return await saveFileUpload({
        filename: file.originalname,
        contentType: file.mimetype,
        fileSize: file.size,
        storage_type: 'database',
        extractedContent: processed.extractedContent,
        metadata: processed.metadata,
      });
    }
  }

  async getFile(fileId: string): Promise<ProcessedFile> {
    const fileRecord = await getFileById(fileId);

    if (fileRecord.storage_type === 'volume') {
      // Check cache first
      const cached = this.sessionMemory.getFile(fileId);
      if (cached) return cached;

      // Fetch from volume
      const content = await this.volumeStorage.readFile(
        fileRecord.volume_path
      );

      // Cache for performance
      this.sessionMemory.cacheFile(fileId, content, 3600);

      return {
        ...fileRecord,
        content,
      };
    } else {
      // Return from database
      return fileRecord;
    }
  }
}
```

### Phase 3: Migration Implementation (Week 2-3)

#### 3.1 Migration Script
```typescript
// scripts/migrate-files-to-volumes.ts
export class FileMigrator {
  async migrateAllFiles() {
    const batchSize = 100;
    let offset = 0;

    while (true) {
      const files = await getFilesForMigration(batchSize, offset);
      if (files.length === 0) break;

      await Promise.all(
        files.map(file => this.migrateFile(file))
      );

      offset += batchSize;
      console.log(`Migrated ${offset} files...`);
    }
  }

  async migrateFile(file: FileUpload) {
    try {
      // Skip if already migrated
      if (file.storage_type === 'volume') return;

      // Skip if too small (keep in DB for performance)
      if (file.fileSize < 100 * 1024) return;

      // Get content from database
      const content = Buffer.from(
        file.extractedContent || '',
        file.contentType.includes('image') ? 'base64' : 'utf8'
      );

      // Upload to volume
      const volumeFile = await this.volumeStorage.uploadFile(
        content,
        file.filename,
        file.projectId
      );

      // Update database record
      await updateFileStorage(file.id, {
        volume_path: volumeFile.path,
        storage_type: 'volume',
        file_checksum: volumeFile.checksum,
        extractedContent: null, // Clear from DB
      });

      console.log(`Migrated file ${file.id}: ${file.filename}`);
    } catch (error) {
      console.error(`Failed to migrate file ${file.id}:`, error);
      await logMigrationError(file.id, error);
    }
  }
}
```

#### 3.2 Rollback Plan
```typescript
// scripts/rollback-volume-migration.ts
export class MigrationRollback {
  async rollbackFile(fileId: string) {
    const file = await getFileById(fileId);

    if (file.storage_type !== 'volume') {
      console.log('File not in volume, skipping');
      return;
    }

    // Download from volume
    const content = await this.volumeStorage.readFile(
      file.volume_path
    );

    // Store back in database
    await updateFileStorage(fileId, {
      extractedContent: content.toString('base64'),
      storage_type: 'database',
      volume_path: null,
    });

    // Delete from volume
    await this.volumeStorage.deleteFile(file.volume_path);
  }
}
```

### Phase 4: Testing & Validation (Week 3)

#### 4.1 Performance Testing
- Upload speed comparison (DB vs Volume)
- Download speed comparison
- Concurrent access testing
- Large file handling (>100MB)

#### 4.2 Integration Testing
- File upload/download flow
- Project file management
- Chat context with volume files
- Migration script validation

#### 4.3 Load Testing
- 1000 concurrent file uploads
- 10,000 file retrievals
- Volume storage limits
- Network bandwidth impact

### Phase 5: Production Rollout (Week 4)

#### 5.1 Staged Rollout
1. **Stage 1**: New uploads only (keep reads from DB)
2. **Stage 2**: Dual reads (DB + Volume)
3. **Stage 3**: Migrate 10% of files
4. **Stage 4**: Migrate 50% of files
5. **Stage 5**: Complete migration
6. **Stage 6**: Remove DB content (keep pointers)

#### 5.2 Monitoring
- Volume storage usage
- API latency metrics
- Error rates
- Cache hit rates

#### 5.3 Success Criteria
- [ ] 90% reduction in database size
- [ ] <100ms file retrieval latency (p95)
- [ ] Zero data loss during migration
- [ ] 99.9% availability maintained

## Benefits Analysis

### Cost Savings
- **Database Storage**: $0.50/GB/month → **Volume Storage**: $0.023/GB/month
- **Estimated Savings**: 95% reduction in storage costs
- **Backup Costs**: 80% reduction

### Performance Improvements
- **Upload Speed**: 2-3x faster for large files
- **Download Speed**: 5-10x faster with CDN
- **Database Queries**: 50% faster without BLOB data

### Scalability
- **File Size Limit**: 1GB → 5TB
- **Concurrent Access**: 100 → 10,000
- **Storage Capacity**: 1TB → Unlimited

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during migration | High | Incremental migration with verification |
| Volume access failures | Medium | Fallback to database, retry logic |
| Performance degradation | Low | Caching layer, CDN integration |
| Cost overrun | Low | Usage monitoring, alerts |

## Timeline

- **Week 1**: Infrastructure setup
- **Week 2**: Service implementation
- **Week 3**: Migration tooling
- **Week 4**: Testing & validation
- **Week 5**: Production rollout
- **Week 6**: Monitoring & optimization

## Success Metrics

1. **Migration Completion**: 100% of eligible files migrated
2. **Performance**: <100ms p95 latency
3. **Cost Reduction**: >90% storage cost savings
4. **Reliability**: 99.9% availability
5. **User Experience**: No degradation in file operations

## Next Steps

1. [ ] Review and approve plan
2. [ ] Set up Databricks Volumes in dev environment
3. [ ] Implement VolumeStorage service
4. [ ] Create migration scripts
5. [ ] Begin staged rollout

---

*Document Version: 1.0*
*Last Updated: January 2024*
*Author: Architecture Team*