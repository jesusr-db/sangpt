# Entra ID Authentication for Databricks SQL Connector for Python

**Research Date:** 2026-02-10
**Customer Question:** Do you know if there are any plans to support Entra authentication for the Databricks SQL connector for Python? If so, do we have an ETA?
**Reference:** https://learn.microsoft.com/en-us/azure/databricks/dev-tools/python-sql-connector#authentication

---

## Summary

Entra ID (Azure AD) authentication is **partially supported** as of version 4.1.0 (August 2025). Service Principal (M2M) authentication is fully supported, while interactive user (U2M) authentication with `azure-identity` requires a workaround.

---

## Current State

| Authentication Method | Supported | Version | Notes |
|----------------------|-----------|---------|-------|
| **Entra ID M2M (Service Principal)** | ✅ Yes | v4.1.0+ | Full native support |
| **Entra ID U2M (Interactive User)** | ⚠️ Partial | - | Workaround required |
| **Azure OAuth U2M** | ✅ Yes | Earlier | Opens browser for auth |
| **Databricks OAuth U2M** | ✅ Yes | Earlier | Native support |
| **Personal Access Token** | ✅ Yes | Always | Via `access_token` parameter |

---

## Service Principal (M2M) - Fully Supported

As of v4.1.0, use `auth_type="azure-sp-m2m"`:

```python
from databricks import sql

connection = sql.connect(
    server_hostname="adb-XXXXX.azuredatabricks.net",
    http_path="/sql/1.0/warehouses/XXXXX",
    auth_type="azure-sp-m2m",
    azure_client_id="your-sp-client-id",
    azure_client_secret="your-sp-client-secret",
    azure_tenant_id="your-tenant-id"  # Optional - auto-detected from hostname
)
```

---

## Interactive User (U2M) - Workaround Required

Native `azure-identity` integration (DefaultAzureCredential, DeviceCodeCredential, etc.) is **not yet built-in**. GitHub issue #690 tracks this request.

### Current Workaround

```python
from azure.identity import DefaultAzureCredential
from databricks import sql as dbx_sql

# Databricks Azure resource scope
_DATABRICKS_SCOPE = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d/.default"

DATABRICKS_CLUSTER_HOST = "adb-XXX.azuredatabricks.net"
DATABRICKS_CLUSTER_HTTP_PATH = "/sql/1.0/warehouses/XXX"

# Get token using Azure Identity
cred = DefaultAzureCredential()
token = cred.get_token(_DATABRICKS_SCOPE)

# Pass token directly to connector
with dbx_sql.connect(
    server_hostname=DATABRICKS_CLUSTER_HOST,
    http_path=DATABRICKS_CLUSTER_HTTP_PATH,
    access_token=token.token,  # Pass the Entra ID token
) as conn, conn.cursor() as c:
    c.execute("SELECT current_user(), current_catalog(), current_schema();")
    print(c.fetchall())
```

**Limitation:** Token refresh must be handled manually by the application.

---

## Roadmap / ETA

**No official ETA has been announced** for native Entra ID U2M support with `azure-identity` integration.

- **GitHub Issue #690** (opened Sept 2025) requests native U2M support - no maintainer response on timeline
- **GitHub Issue #621** (closed) added M2M Service Principal support in v4.1.0
- The existing `auth_type="azure-oauth"` suggests infrastructure exists, but user-interactive flow with `azure-identity` is not yet native

---

## Recommendations for Customer

1. **For Service Principals (M2M):** Upgrade to v4.1.0+ and use `auth_type="azure-sp-m2m"` - fully supported

2. **For Interactive Users (U2M):**
   - Use the workaround above with `azure-identity` and manual token management
   - Subscribe to GitHub issue #690 for updates
   - Implement token refresh logic in application

3. **Alternative:** Use `auth_type="azure-oauth"` for native OAuth U2M flow (opens browser)

---

## Confidence Level: 7/10

**Reasoning:**
- High confidence on current state (verified from GitHub source code, releases, changelog)
- Medium confidence on roadmap (no official PM statements found)
- Internal Glean/Slack searches not completed due to MCP token expiration

---

## References

- GitHub Repository: https://github.com/databricks/databricks-sql-python
- GitHub Issue #690 (U2M Request): https://github.com/databricks/databricks-sql-python/issues/690
- GitHub Issue #621 (M2M Implementation): https://github.com/databricks/databricks-sql-python/issues/621
- Changelog: https://github.com/databricks/databricks-sql-python/blob/main/CHANGELOG.md
- Azure Databricks Docs: https://learn.microsoft.com/en-us/azure/databricks/dev-tools/python-sql-connector
- Databricks Docs: https://docs.databricks.com/dev-tools/python-sql-connector.html

---

## Next Steps (After Claude Code Restart)

1. Search Glean for internal roadmap docs about Entra ID / Azure AD authentication
2. Search Slack for PM/engineering discussions about SQL connector authentication
3. Update confidence level and ETA if internal info found

**MCP credentials refreshed:** Glean and Slack tokens valid until 2026-02-10/11. Restart Claude Code to use new tokens.
