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
- [ ] **File toggle for conversations** - Enable/disable individual files per chat to save tokens
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
   - **Vector Search** - Query Databricks Vector Search indexes for RAG
   - Custom MCP servers for specific needs

5. **Vector Search Integration**
   ```typescript
   // Tool definition for vector search
   const vectorSearchTool = {
     name: 'search_knowledge_base',
     description: 'Search vector index for relevant documents',
     parameters: {
       query: z.string().describe('Search query'),
       index_name: z.string().describe('Vector search index name'),
       num_results: z.number().default(5),
       filters: z.record(z.any()).optional(),
     },
     execute: async ({ query, index_name, num_results, filters }) => {
       // Call Databricks Vector Search API
       const response = await fetch(`${host}/api/2.0/vector-search/indexes/${index_name}/query`, {
         method: 'POST',
         body: JSON.stringify({ query_text: query, num_results, filters }),
       });
       return response.json();
     },
   };
   ```

#### Benefits
- Real-time information access
- Enhanced research capabilities
- Integration with enterprise data sources
- **RAG over large document collections** via Vector Search
- Extensible through Unity Catalog connections

#### Implementation Timeline
- Databricks MCP client setup (2-3 hours)
- Tool integration and conversion (3-4 hours)
- External MCP configuration (2-3 hours)
- Vector Search tool implementation (2-3 hours)
- Testing and documentation (2-3 hours)
- **Total**: 2-3 days

### Phase 6: Advanced Project Features
- [ ] Project templates with predefined contexts
- [ ] Project sharing and collaboration
- [ ] Project archiving and export
- [ ] Project activity history
- [ ] Project-level settings (default model, parameters)

### Phase 7: Enhanced Context Management
- [ ] Context versioning
- [ ] Context templates library
- [ ] Dynamic context based on file types
- [ ] Context validation and testing
- [ ] Context performance metrics

### Phase 8: Project Analytics
- [ ] Token usage per project
- [ ] Cost tracking per project
- [ ] Chat activity metrics
- [ ] Project health dashboard
- [ ] Usage reports and exports

### Phase 9: Team Collaboration
- [ ] Share projects with team members
- [ ] Role-based access control (owner, editor, viewer)
- [ ] Project comments and annotations
- [ ] Collaborative editing of context
- [ ] Activity feed

### Phase 10: Enterprise Features
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

## 🎯 Priority Matrix

### High Priority (Do Next)
1. Phase 4: Complete shared files & context
2. Phase 5: MCP Tool Capabilities
3. Project templates

### Medium Priority (Plan Soon)
1. Phase 6: Advanced project features
2. Phase 7: Enhanced context management
3. Performance optimizations

### Low Priority (Future)
1. Phase 9: Team collaboration
2. Phase 10: Enterprise features
3. Cross-workspace sync

## 📅 Estimated Timeline

- **Q1 2024**: Complete Phase 4, Implement Phase 5 (MCP Tools)
- **Q2 2024**: Phase 6 (Advanced Project Features)
- **Q3 2024**: Phase 7 & 8 (Context & Analytics)
- **Q4 2024**: Phase 9 (Collaboration) + Performance improvements
- **2025**: Phase 10 (Enterprise features) and scale optimizations

---

*Last Updated: February 2026*
*Version: 1.1.0*