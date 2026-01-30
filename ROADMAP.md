# Projects Feature Roadmap

## ✅ Completed Phases (1-3)

### Phase 1: Core Project Infrastructure
- [x] Database schema for projects
- [x] Project CRUD operations
- [x] API endpoints for project management
- [x] Project service layer

### Phase 2: UI Foundation
- [x] Projects tab in sidebar
- [x] Project list component
- [x] Project creation/edit modal
- [x] Project indicator in chat header

### Phase 3: Project-Chat Association
- [x] Link chats to projects
- [x] Move chats between projects
- [x] Project overview page
- [x] Visual project indicators on chats

## 🚧 In Progress

### Phase 4: Shared Files & Context
- [x] Extend SessionMemory for project-level file storage
- [ ] Project file management UI
- [x] Context inheritance for new chats
- [ ] Project templates

## 📋 Future Roadmap

### Phase 5: MCP Tool Capabilities
**Priority: HIGH** - Enable AI to gather recent events and do additional research

#### Overview
Enable the AI model to use MCP (Model Context Protocol) tools for gathering recent events, doing additional research, and extending its capabilities beyond base language model functions. Integrates with Unity Catalog external connections using Databricks-specific MCP implementation.

#### Current State
- Only basic Databricks tools available (`DATABRICKS_TOOL_CALL_ID`)
- No external data access or research capabilities
- Limited to knowledge cutoff and provided context

#### Implementation Approach

1. **Databricks MCP Client**
   ```typescript
   // server/src/services/databricks-mcp-client.ts
   class DatabricksMCPClient {
     // Connect to MCP servers through Unity Catalog
     async initialize()
     async listTools()
     async callTool(endpoint, toolName, args)
   }
   ```

2. **Unity Catalog Integration**
   - Configure external MCP connections in Unity Catalog
   - Access via proxy: `{host}/api/2.0/mcp/external/{connection_name}`
   - Built-in system AI: `{host}/api/2.0/mcp/functions/system/ai`

3. **Tool Conversion**
   - Convert MCP tools to Vercel AI SDK format
   - JSON Schema to Zod schema conversion
   - Error handling and retry logic

4. **Available Capabilities**
   - Web search and news (via external MCP servers)
   - Web content fetching and analysis
   - Enterprise data access through Unity Catalog
   - Custom MCP servers for specific needs

#### Benefits
- Real-time information access
- Enhanced research capabilities
- Integration with enterprise data sources
- Extensible through Unity Catalog connections

#### Implementation Timeline
- Databricks MCP client setup (2-3 hours)
- Tool integration and conversion (3-4 hours)
- External MCP configuration (2-3 hours)
- Testing and documentation (2-3 hours)
- **Total**: 1-2 days

### Phase 6: File Storage Migration to Databricks Volumes
**Priority: HIGH** - Improve scalability and performance

#### Current State
- Files stored as base64/text in PostgreSQL database
- `storagePath` field exists but unused
- Large files increase database size significantly
- Base64 encoding adds ~33% overhead for images

#### Target Architecture
```
┌─────────────────┐
│   PostgreSQL    │
│   Database      │
│ ┌─────────────┐ │
│ │ FileUpload  │ │
│ │ - id        │ │
│ │ - filename  │ │
│ │ - volumePath│ │──────┐
│ │ - metadata  │ │      │
│ └─────────────┘ │      │
└─────────────────┘      │
                         ▼
              ┌──────────────────┐
              │ Databricks       │
              │ Volumes          │
              │ ┌──────────────┐ │
              │ │ /projects/    │ │
              │ │   /{project}/ │ │
              │ │     /files/   │ │
              │ │       /{id}   │ │
              │ └──────────────┘ │
              └──────────────────┘
```

#### Implementation Plan

1. **Database Schema Updates**
   ```sql
   ALTER TABLE "FileUpload"
   ADD COLUMN volume_path TEXT,
   ADD COLUMN volume_name TEXT DEFAULT 'project-files',
   ADD COLUMN storage_type VARCHAR DEFAULT 'database';

   -- Migrate existing storagePath to volume_path
   UPDATE "FileUpload"
   SET volume_path = storagePath,
       storage_type = 'volume'
   WHERE storagePath IS NOT NULL;
   ```

2. **Volume Management Service**
   ```typescript
   // server/src/services/volume-storage.ts
   class VolumeStorage {
     async uploadToVolume(file: Buffer, path: string): Promise<string>
     async readFromVolume(path: string): Promise<Buffer>
     async deleteFromVolume(path: string): Promise<void>
     async listVolumePath(path: string): Promise<string[]>
   }
   ```

3. **Migration Strategy**
   - New uploads go to Volumes by default
   - Background job to migrate existing files
   - Dual-read support during transition
   - Cleanup database content after migration

4. **File Organization in Volumes**
   ```
   /Volumes/main/project-files/
   ├── projects/
   │   ├── {project-id}/
   │   │   ├── files/
   │   │   │   ├── {file-id}-{filename}
   │   │   │   └── metadata.json
   │   │   └── exports/
   │   └── shared/
   │       └── templates/
   └── user-files/
       └── {user-id}/
           └── {chat-id}/
               └── {file-id}-{filename}
   ```

5. **Benefits**
   - Reduced database size (80-90% reduction for file-heavy projects)
   - Better performance for large files
   - Direct file access for ML/data processing workflows
   - Native integration with Databricks tools
   - Cost-effective storage

6. **Configuration**
   ```yaml
   # databricks.yml additions
   resources:
     volumes:
       project_files:
         name: project-files
         catalog: main
         schema: ${var.catalog_schema}
         path: /Volumes/main/${var.catalog_schema}/project-files
   ```

### Phase 7: Advanced Project Features
- [ ] Project templates with predefined contexts
- [ ] Project sharing and collaboration
- [ ] Project archiving and export
- [ ] Project activity history
- [ ] Project-level settings (default model, parameters)

### Phase 8: Enhanced Context Management
- [ ] Context versioning
- [ ] Context templates library
- [ ] Dynamic context based on file types
- [ ] Context validation and testing
- [ ] Context performance metrics

### Phase 9: Project Analytics
- [ ] Token usage per project
- [ ] Cost tracking per project
- [ ] Chat activity metrics
- [ ] Project health dashboard
- [ ] Usage reports and exports

### Phase 10: Team Collaboration
- [ ] Share projects with team members
- [ ] Role-based access control (owner, editor, viewer)
- [ ] Project comments and annotations
- [ ] Collaborative editing of context
- [ ] Activity feed

### Phase 11: Enterprise Features
- [ ] Project approval workflows
- [ ] Compliance and audit logs
- [ ] Data retention policies
- [ ] Project backup and restore
- [ ] Cross-workspace project sync

## 🔧 Technical Debt & Improvements

### Performance Optimizations
- [ ] Implement project caching layer
- [ ] Optimize project list queries with pagination
- [ ] Add database indexes for project queries
- [ ] Lazy load project contexts

### Code Quality
- [ ] Add comprehensive test coverage for projects
- [ ] Extract project types to shared package
- [ ] Refactor project context management
- [ ] Add project API documentation

### User Experience
- [ ] Add project search and filtering
- [ ] Implement drag-and-drop for moving chats
- [ ] Add keyboard shortcuts for project operations
- [ ] Improve project creation wizard
- [ ] Add project quick switcher (Cmd+K style)

## 📊 Success Metrics

### Adoption Metrics
- Number of projects created
- Percentage of chats in projects
- Average files per project
- Context reuse rate

### Performance Metrics
- Project load time
- File upload/retrieval speed
- Database query performance
- Storage cost reduction (after Volume migration)

### User Satisfaction
- Project feature usage analytics
- User feedback scores
- Feature request patterns
- Support ticket reduction

## 🚀 Quick Wins (Can be done anytime)

1. **Add project badges** - Show chat count, file count in project list
2. **Project colors in UI** - Use project colors more prominently
3. **Recent projects** - Quick access to recently used projects
4. **Project shortcuts** - Pin favorite projects
5. **Bulk operations** - Select multiple chats to move/delete
6. **Project README** - Markdown documentation for projects
7. **Project quick actions** - Common actions in project dropdown
8. **Empty state improvements** - Better onboarding for new users

## 📝 Notes

### Migration to Databricks Volumes - Key Considerations

1. **Backwards Compatibility**
   - Maintain dual-storage support during transition
   - Gradual migration with feature flags
   - Rollback plan if issues arise

2. **Security**
   - Ensure proper access controls on Volumes
   - Encrypt sensitive files at rest
   - Audit file access patterns

3. **Performance Testing**
   - Benchmark Volume vs Database performance
   - Test with various file sizes
   - Monitor impact on chat latency

4. **Cost Analysis**
   - Compare storage costs (Database vs Volumes)
   - Factor in data transfer costs
   - Consider backup/replication costs

5. **Developer Experience**
   - Update local development setup
   - Provide Volume emulation for testing
   - Clear migration documentation

## 🎯 Priority Matrix

### High Priority (Do Next)
1. Phase 4: Complete shared files & context
2. Phase 5: MCP Tool Capabilities
3. Phase 6: Databricks Volumes migration
4. Project templates

### Medium Priority (Plan Soon)
1. Phase 7: Advanced project features
2. Phase 8: Enhanced context management
3. Performance optimizations

### Low Priority (Future)
1. Phase 10: Team collaboration
2. Phase 11: Enterprise features
3. Cross-workspace sync

## 📅 Estimated Timeline

- **Q1 2024**: Complete Phase 4, Implement Phase 5 (MCP Tools)
- **Q2 2024**: Start Phase 6 (Volumes migration), Complete Phase 7
- **Q3 2024**: Phase 8 & 9 (Context & Analytics)
- **Q4 2024**: Phase 10 (Collaboration) + Performance improvements
- **2025**: Phase 11 (Enterprise features) and scale optimizations

---

*Last Updated: January 2024*
*Version: 1.0.0*