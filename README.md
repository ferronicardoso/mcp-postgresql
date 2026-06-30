# mcp-postgresql

Production-oriented MCP server for PostgreSQL, exposing database operations to MCP clients (Claude Desktop, VS Code Copilot, Cursor, and compatible hosts).

## Features

- Query execution (`SELECT`, `INSERT`, `UPDATE`, `DELETE`)
- Database discovery and schema introspection
- Table metadata inspection (columns, types, nullability, defaults, PK)
- Index and foreign key discovery
- Environment-driven configuration for secure deployment

## Available Tools

| Tool | Description |
|---|---|
| `execute_query` | Executes a SQL statement and returns rows or affected row count |
| `list_tables` | Lists tables from `INFORMATION_SCHEMA.TABLES` (optional schema filter) |
| `describe_table` | Returns table column metadata and primary key markers |
| `list_databases` | Lists all PostgreSQL databases |
| `get_table_indexes` | Lists table indexes with definitions and PK/unique flags |
| `get_foreign_keys` | Lists table foreign keys and referenced targets |

## Requirements

- Node.js 18+
- Access to a PostgreSQL instance
- Network connectivity from MCP host to PostgreSQL (`host:port`)

## Configuration

Set connection settings using environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `PGHOST` (or `POSTGRES_HOST`) | No | `localhost` | PostgreSQL host or IP |
| `PGPORT` (or `POSTGRES_PORT`) | No | `5432` | PostgreSQL TCP port |
| `PGDATABASE` (or `POSTGRES_DB`) | No | `postgres` | Default database |
| `PGUSER` (or `POSTGRES_USER`) | Yes | — | Database user |
| `PGPASSWORD` (or `POSTGRES_PASSWORD`) | Yes | — | Database password |
| `PGSSL` (or `POSTGRES_SSL`) | No | `false` | Enables SSL/TLS |
| `PGPOOL_MAX` | No | `10` | Max pool connections |
| `PGPOOL_IDLE_TIMEOUT_MS` | No | `30000` | Pool idle timeout (ms) |

## Usage

### Run directly from GitHub

```bash
npx github:ferronicardoso/mcp-postgresql
```

### Claude Desktop configuration

`%APPDATA%\\Claude\\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "postgresql": {
      "command": "npx",
      "args": ["github:ferronicardoso/mcp-postgresql"],
      "env": {
        "PGHOST": "localhost",
        "PGPORT": "5432",
        "PGDATABASE": "postgres",
        "PGUSER": "postgres",
        "PGPASSWORD": "your-password"
      }
    }
  }
}
```

### VS Code MCP configuration

`.vscode/mcp.json`:

```json
{
  "servers": {
    "postgresql": {
      "command": "npx",
      "args": ["github:ferronicardoso/mcp-postgresql"],
      "env": {
        "PGHOST": "localhost",
        "PGPORT": "5432",
        "PGDATABASE": "postgres",
        "PGUSER": "postgres",
        "PGPASSWORD": "your-password"
      }
    }
  }
}
```

## Local Development

```bash
git clone https://github.com/ferronicardoso/mcp-postgresql
cd mcp-postgresql
npm install
npm run build
```

Start the compiled server:

```bash
npm start
```

## Build and Commit Workflow

This repository intentionally tracks `dist/` to support `npx github:user/repo` usage.

The project uses a Husky `pre-commit` hook to:
1. build TypeScript (`npm run build`)
2. stage generated artifacts (`git add dist`)

Manual fallback:

```bash
npm run build
git add dist
```

## Security Notes

- Never commit real credentials or `.env` files.
- Prefer least-privilege database users for production use.
- For public or untrusted networks, enable encryption (`PGSSL=true`) and configure certificates appropriately.
