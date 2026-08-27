import React, { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  DatabaseIcon,
  RefreshIcon,
  SearchIcon,
  CloseIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LayersIcon,
} from "./icons";

export interface DbEndpoint {
  id: string;
  vps_id: string;
  product: string;
  kind: "native" | "docker";
  engine: string | null;
  host: string;
  port: number;
  container?: string | null;
  image?: string | null;
}

export interface DbSavedConnection {
  id: string;
  username: string;
  host?: string;
  port?: number;
  container?: string | null;
  has_secret: boolean;
}

export interface DbTable {
  name: string;
  rows: number;
  bytes: number;
  engine?: string;
  kind?: string;
}

export interface DbInstance {
  endpoint: DbEndpoint;
  saved?: DbSavedConnection;
  sessionId: string | null;
  version: string;
  schemas: string[];
  tables: Record<string, DbTable[]>;
  expanded: boolean;
  openSchemas: string[];
  busy: boolean;
  error: string | null;
}

export const DB_PRODUCT_LABEL: Record<string, string> = {
  mysql: "MySQL",
  mariadb: "MariaDB",
  postgres: "PostgreSQL",
  redis: "Redis",
  sqlite: "SQLite",
};

export function newInstance(endpoint: DbEndpoint): DbInstance {
  return {
    endpoint,
    sessionId: null,
    version: "",
    schemas: [],
    tables: {},
    expanded: false,
    openSchemas: [],
    busy: false,
    error: null,
  };
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function DatabaseTree({
  instances,
  vpsId,
  scanning,
  selected,
  onPatch,
  onSelectTable,
  onRescan,
  onDisconnect,
}: {
  instances: DbInstance[];
  vpsId: string;
  scanning: boolean;
  selected: { endpointId: string; schema: string; table: string } | null;
  onPatch: (endpointId: string, patch: Partial<DbInstance>) => void;
  onSelectTable: (instance: DbInstance, schema: string, table: string) => void;
  onRescan: () => void;
  onDisconnect?: (instance: DbInstance) => void;
}) {
  const [filter, setFilter] = useState("");
  const filterQ = filter.trim().toLowerCase();

  const toggleInstance = (inst: DbInstance) =>
    onPatch(inst.endpoint.id, { expanded: !inst.expanded });

  const toggleSchema = async (inst: DbInstance, schema: string) => {
    const open = inst.openSchemas.includes(schema);
    if (open) {
      onPatch(inst.endpoint.id, {
        openSchemas: inst.openSchemas.filter((s) => s !== schema),
      });
      return;
    }
    onPatch(inst.endpoint.id, { openSchemas: [...inst.openSchemas, schema] });
    if (inst.tables[schema] || !inst.sessionId) return;
    onPatch(inst.endpoint.id, { busy: true });
    try {
      const tables = await invoke<DbTable[]>("db_list_tables", { sessionId: inst.sessionId, schema });
      onPatch(inst.endpoint.id, {
        tables: { ...inst.tables, [schema]: tables },
        busy: false,
        error: null,
      });
    } catch (e) {
      onPatch(inst.endpoint.id, { busy: false, error: String(e) });
    }
  };

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-2)] select-none overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-2.5 py-2 bg-[var(--surface)]">
        <span className="text-[11px] uppercase font-semibold tracking-wider text-gray-400">
          Databases ({instances.length})
        </span>
        <button
          onClick={onRescan}
          disabled={scanning}
          className="rounded p-1 text-gray-400 hover:text-white"
          title="Rescan databases"
        >
          <RefreshIcon size={12} className={scanning ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-1 space-y-0.5">
        {instances.map((inst) => {
          const { endpoint: ep } = inst;
          return (
            <div key={ep.id} className="group">
              <div className="flex w-full items-center gap-1 px-2 py-1 text-left text-xs text-gray-200 hover:bg-[var(--border)]/70 cursor-pointer" onClick={() => toggleInstance(inst)}>
                <span className="w-3 text-gray-500">
                  {inst.expanded ? <ChevronDownIcon size={10} /> : <ChevronRightIcon size={10} />}
                </span>
                <DatabaseIcon size={12} className="text-violet-400" />
                <span className="truncate font-medium">{ep.container || ep.host}</span>
                <span className="ml-auto font-mono text-[10px] text-gray-500">:{ep.port}</span>
              </div>

              {inst.expanded && (
                <div className="pl-5 pr-2 py-1 space-y-1">
                  {inst.schemas.map((schema) => (
                    <div key={schema}>
                      <div
                        className="flex items-center gap-1 py-0.5 text-xs text-gray-300 hover:text-white cursor-pointer"
                        onClick={() => toggleSchema(inst, schema)}
                      >
                        <span>{inst.openSchemas.includes(schema) ? "▾" : "▸"}</span>
                        <span>{schema}</span>
                      </div>

                      {inst.openSchemas.includes(schema) && (
                        <div className="pl-4 space-y-0.5">
                          {(inst.tables[schema] || []).map((tbl) => (
                            <div
                              key={tbl.name}
                              className="text-[11px] text-gray-400 hover:text-violet-300 cursor-pointer truncate font-mono py-0.2"
                              onClick={() => onSelectTable(inst, schema, tbl.name)}
                            >
                              {tbl.name} ({tbl.rows})
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
