#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import type { Request, Response } from 'express';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Pool, PoolConfig } from 'pg';

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

const dbConfig: PoolConfig = {
  host: process.env.PGHOST ?? process.env.POSTGRES_HOST ?? 'localhost',
  port: Number.parseInt(process.env.PGPORT ?? process.env.POSTGRES_PORT ?? '5432', 10),
  database: process.env.PGDATABASE ?? process.env.POSTGRES_DB ?? 'postgres',
  user: process.env.PGUSER ?? process.env.POSTGRES_USER,
  password: process.env.PGPASSWORD ?? process.env.POSTGRES_PASSWORD,
  ssl: parseBoolean(process.env.PGSSL ?? process.env.POSTGRES_SSL, false),
  max: Number.parseInt(process.env.PGPOOL_MAX ?? '10', 10),
  idleTimeoutMillis: Number.parseInt(process.env.PGPOOL_IDLE_TIMEOUT_MS ?? '30000', 10),
};

const pool = new Pool(dbConfig);

async function query(text: string, values: unknown[] = []) {
  return pool.query(text, values);
}

// ---------------------------------------------------------------------------
// Servidor MCP
// ---------------------------------------------------------------------------
function createServer(): Server {
  const server = new Server(
    { name: 'mcp-postgresql', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

// ---------------------------------------------------------------------------
// Definição das ferramentas
// ---------------------------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'execute_query',
      description:
        'Executes a SQL query in PostgreSQL and returns rows or affected row count.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'SQL query to execute',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'list_tables',
      description: 'Lists tables in the current database, optionally filtered by schema.',
      inputSchema: {
        type: 'object',
        properties: {
          schema: {
            type: 'string',
            description: 'Schema to filter (default: all non-system schemas)',
          },
        },
      },
    },
    {
      name: 'describe_table',
      description:
        'Returns table structure: columns, types, nullability, defaults, and PK markers.',
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Table name',
          },
          schema: {
            type: 'string',
            description: 'Table schema (default: public)',
          },
        },
        required: ['table'],
      },
    },
    {
      name: 'list_databases',
      description: 'Lists all PostgreSQL databases in the server.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_table_indexes',
      description: 'Lists indexes for a table with index definition and PK/uniqueness flags.',
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Table name',
          },
          schema: {
            type: 'string',
            description: 'Table schema (default: public)',
          },
        },
        required: ['table'],
      },
    },
    {
      name: 'get_foreign_keys',
      description: 'Lists foreign keys of a table and their referenced targets.',
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Table name',
          },
          schema: {
            type: 'string',
            description: 'Table schema (default: public)',
          },
        },
        required: ['table'],
      },
    },
  ],
}));

// ---------------------------------------------------------------------------
// Implementação das ferramentas
// ---------------------------------------------------------------------------
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'execute_query': {
        const query = args?.query as string;
        const result = await pool.query(query);
        const output =
          result.rows.length > 0
            ? JSON.stringify(result.rows, null, 2)
            : `Query executed successfully. Rows affected: ${result.rowCount ?? 0}`;
        return { content: [{ type: 'text', text: output }] };
      }

      case 'list_tables': {
        const schema = args?.schema as string | undefined;
        let sql = `
          SELECT table_schema, table_name, table_type
          FROM information_schema.tables
        `;
        const values: unknown[] = [];

        if (schema) {
          sql += ' WHERE table_schema = $1';
          values.push(schema);
        } else {
          sql += ` WHERE table_schema NOT IN ('pg_catalog', 'information_schema')`;
        }

        sql += ' ORDER BY table_schema, table_name';
        const result = await query(sql, values);
        return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
      }

      case 'describe_table': {
        const table = args?.table as string;
        const schema = (args?.schema as string) ?? 'public';
        const result = await query(
          `
          SELECT
            c.column_name,
            c.data_type,
            c.character_maximum_length,
            c.numeric_precision,
            c.numeric_scale,
            c.is_nullable,
            c.column_default,
            CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN 'YES' ELSE 'NO' END AS is_primary_key
          FROM information_schema.columns c
          LEFT JOIN information_schema.key_column_usage kcu
            ON c.table_schema = kcu.table_schema
           AND c.table_name = kcu.table_name
           AND c.column_name = kcu.column_name
          LEFT JOIN information_schema.table_constraints tc
            ON kcu.constraint_name = tc.constraint_name
           AND kcu.table_schema = tc.table_schema
          WHERE c.table_schema = $1 AND c.table_name = $2
          ORDER BY c.ordinal_position
          `,
          [schema, table]
        );
        return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
      }

      case 'list_databases': {
        const result = await query(
          `
          SELECT datname AS database_name,
                 pg_catalog.pg_get_userbyid(datdba) AS owner,
                 encoding,
                 datcollate AS collation,
                 datctype AS ctype
          FROM pg_database
          WHERE datistemplate = false
          ORDER BY datname
          `
        );
        return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
      }

      case 'get_table_indexes': {
        const table = args?.table as string;
        const schema = (args?.schema as string) ?? 'public';
        const result = await query(
          `
          SELECT
            i.relname AS index_name,
            ix.indisunique AS is_unique,
            ix.indisprimary AS is_primary_key,
            pg_get_indexdef(ix.indexrelid) AS index_definition
          FROM pg_class t
          JOIN pg_namespace n ON n.oid = t.relnamespace
          JOIN pg_index ix ON t.oid = ix.indrelid
          JOIN pg_class i ON i.oid = ix.indexrelid
          WHERE n.nspname = $1
            AND t.relname = $2
          ORDER BY ix.indisprimary DESC, i.relname
          `,
          [schema, table]
        );
        return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
      }

      case 'get_foreign_keys': {
        const table = args?.table as string;
        const schema = (args?.schema as string) ?? 'public';
        const result = await query(
          `
          SELECT
            tc.constraint_name AS fk_name,
            kcu.column_name,
            ccu.table_schema AS referenced_schema,
            ccu.table_name AS referenced_table,
            ccu.column_name AS referenced_column
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
           AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = $1
            AND tc.table_name = $2
          ORDER BY tc.constraint_name, kcu.ordinal_position
          `,
          [schema, table]
        );
        return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
      isError: true,
    };
  }
});

  return server;
}

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
const MCP_TRANSPORT = (process.env.MCP_TRANSPORT ?? 'stdio').toLowerCase();

async function startHttpServer() {
  const port = Number.parseInt(process.env.MCP_HTTP_PORT ?? '3002', 10);
  const host = process.env.MCP_HTTP_HOST ?? '0.0.0.0';
  const app = createMcpExpressApp({ host });

  app.post('/mcp', async (req: Request, res: Response) => {
    const server = createServer();
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  const methodNotAllowedBody = JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
  app.get('/mcp', (_req: Request, res: Response) => {
    res.writeHead(405).end(methodNotAllowedBody);
  });
  app.delete('/mcp', (_req: Request, res: Response) => {
    res.writeHead(405).end(methodNotAllowedBody);
  });

  app.listen(port, host, () => {
    console.error(`mcp-postgresql: MCP HTTP server listening on http://${host}:${port}/mcp`);
  });
}

async function main() {
  if (MCP_TRANSPORT === 'http') {
    await startHttpServer();
    return;
  }
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
