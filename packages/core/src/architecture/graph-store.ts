import type Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import {
  GraphService,
  GraphConnection,
  GraphContract,
  ContractEndpoint,
  DataOwnership,
  GraphDiagram,
  ConnectionProtocol,
} from '@engineering-os/shared';
import { openDatabase } from '../utils/database';

export class GraphStore {
  private db: Database.Database | null = null;

  constructor(private dbPath: string) {}

  initialize(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = openDatabase(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        repoName TEXT NOT NULL,
        serviceName TEXT NOT NULL,
        description TEXT,
        owners TEXT,
        criticality TEXT DEFAULT 'medium',
        lastDiscovered TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sourceService TEXT NOT NULL,
        targetService TEXT NOT NULL,
        protocol TEXT NOT NULL,
        contractRef TEXT,
        dataFlow TEXT,
        description TEXT,
        lastVerified TEXT NOT NULL,
        edgeSource TEXT DEFAULT 'manual',
        FOREIGN KEY (sourceService) REFERENCES services(id),
        FOREIGN KEY (targetService) REFERENCES services(id)
      );

      CREATE TABLE IF NOT EXISTS contracts (
        id TEXT PRIMARY KEY,
        repoName TEXT NOT NULL,
        filePath TEXT NOT NULL,
        type TEXT NOT NULL,
        version TEXT,
        endpoints TEXT,
        lastModified TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS data_ownership (
        entity TEXT NOT NULL,
        ownerService TEXT NOT NULL,
        accessType TEXT NOT NULL,
        PRIMARY KEY (entity, ownerService)
      );

      CREATE INDEX IF NOT EXISTS idx_connections_source ON connections(sourceService);
      CREATE INDEX IF NOT EXISTS idx_connections_target ON connections(targetService);
      CREATE INDEX IF NOT EXISTS idx_contracts_repo ON contracts(repoName);
      CREATE INDEX IF NOT EXISTS idx_services_repo ON services(repoName);
    `);
  }

  // --- Services ---

  upsertService(service: GraphService): void {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO services (id, repoName, serviceName, description, owners, criticality, lastDiscovered)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        description = excluded.description,
        owners = excluded.owners,
        criticality = excluded.criticality,
        lastDiscovered = excluded.lastDiscovered
    `).run(
      service.id,
      service.repoName,
      service.serviceName,
      service.description ?? null,
      JSON.stringify(service.owners),
      service.criticality,
      service.lastDiscovered
    );
  }

  getService(id: string): GraphService | null {
    const db = this.getDb();
    const row = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapService(row);
  }

  getServicesByRepo(repoName: string): GraphService[] {
    const db = this.getDb();
    const rows = db.prepare('SELECT * FROM services WHERE repoName = ?').all(repoName) as any[];
    return rows.map((r) => this.mapService(r));
  }

  getAllServices(): GraphService[] {
    const db = this.getDb();
    const rows = db.prepare('SELECT * FROM services').all() as any[];
    return rows.map((r) => this.mapService(r));
  }

  deleteServicesByRepo(repoName: string): number {
    const db = this.getDb();
    const services = this.getServicesByRepo(repoName);
    const ids = services.map((s) => s.id);

    if (ids.length === 0) return 0;

    const transaction = db.transaction(() => {
      for (const id of ids) {
        db.prepare('DELETE FROM connections WHERE sourceService = ? OR targetService = ?').run(id, id);
        db.prepare('DELETE FROM data_ownership WHERE ownerService = ?').run(id);
      }
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM services WHERE id IN (${placeholders})`).run(...ids);
    });

    transaction();
    return ids.length;
  }

  // --- Connections ---

  addConnection(conn: GraphConnection, edgeSource: string = 'manual'): number {
    const db = this.getDb();
    const result = db.prepare(`
      INSERT INTO connections (sourceService, targetService, protocol, contractRef, dataFlow, description, lastVerified, edgeSource)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      conn.sourceService,
      conn.targetService,
      conn.protocol,
      conn.contractRef ?? null,
      conn.dataFlow,
      conn.description ?? null,
      conn.lastVerified,
      edgeSource
    );
    return result.lastInsertRowid as number;
  }

  clearAutoLinkerConnections(): number {
    const db = this.getDb();
    const result = db.prepare("DELETE FROM connections WHERE edgeSource = 'auto-linker'").run();
    return result.changes;
  }

  getConnectionsFrom(serviceId: string): GraphConnection[] {
    const db = this.getDb();
    const rows = db.prepare('SELECT * FROM connections WHERE sourceService = ?').all(serviceId) as any[];
    return rows.map((r) => this.mapConnection(r));
  }

  getConnectionsTo(serviceId: string): GraphConnection[] {
    const db = this.getDb();
    const rows = db.prepare('SELECT * FROM connections WHERE targetService = ?').all(serviceId) as any[];
    return rows.map((r) => this.mapConnection(r));
  }

  getAllConnections(): GraphConnection[] {
    const db = this.getDb();
    const rows = db.prepare('SELECT * FROM connections').all() as any[];
    return rows.map((r) => this.mapConnection(r));
  }

  deleteConnectionsByRepo(repoName: string): void {
    const db = this.getDb();
    db.prepare(`
      DELETE FROM connections
      WHERE sourceService IN (SELECT id FROM services WHERE repoName = ?)
         OR targetService IN (SELECT id FROM services WHERE repoName = ?)
    `).run(repoName, repoName);
  }

  clearConnections(): void {
    const db = this.getDb();
    db.prepare('DELETE FROM connections').run();
  }

  // --- Contracts ---

  upsertContract(contract: GraphContract): void {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO contracts (id, repoName, filePath, type, version, endpoints, lastModified)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        filePath = excluded.filePath,
        type = excluded.type,
        version = excluded.version,
        endpoints = excluded.endpoints,
        lastModified = excluded.lastModified
    `).run(
      contract.id,
      contract.repoName,
      contract.filePath,
      contract.type,
      contract.version ?? null,
      JSON.stringify(contract.endpoints),
      contract.lastModified
    );
  }

  getContract(id: string): GraphContract | null {
    const db = this.getDb();
    const row = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapContract(row);
  }

  getContractsByRepo(repoName: string): GraphContract[] {
    const db = this.getDb();
    const rows = db.prepare('SELECT * FROM contracts WHERE repoName = ?').all(repoName) as any[];
    return rows.map((r) => this.mapContract(r));
  }

  getAllContracts(): GraphContract[] {
    const db = this.getDb();
    const rows = db.prepare('SELECT * FROM contracts').all() as any[];
    return rows.map((r) => this.mapContract(r));
  }

  deleteContractsByRepo(repoName: string): void {
    const db = this.getDb();
    db.prepare('DELETE FROM contracts WHERE repoName = ?').run(repoName);
  }

  // --- Data Ownership ---

  setOwnership(ownership: DataOwnership): void {
    const db = this.getDb();
    db.prepare(`
      INSERT OR REPLACE INTO data_ownership (entity, ownerService, accessType)
      VALUES (?, ?, ?)
    `).run(ownership.entity, ownership.ownerService, ownership.accessType);
  }

  getOwnersOf(entity: string): DataOwnership[] {
    const db = this.getDb();
    const rows = db.prepare('SELECT * FROM data_ownership WHERE entity = ?').all(entity) as any[];
    return rows.map((r) => ({ entity: r.entity, ownerService: r.ownerService, accessType: r.accessType }));
  }

  getEntitiesOwnedBy(serviceId: string): DataOwnership[] {
    const db = this.getDb();
    const rows = db.prepare('SELECT * FROM data_ownership WHERE ownerService = ?').all(serviceId) as any[];
    return rows.map((r) => ({ entity: r.entity, ownerService: r.ownerService, accessType: r.accessType }));
  }

  // --- Graph Queries ---

  findConsumers(serviceId: string): { service: GraphService; connection: GraphConnection }[] {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT s.*, c.id as connId, c.sourceService, c.targetService, c.protocol,
             c.contractRef, c.dataFlow, c.description as connDesc, c.lastVerified
      FROM connections c
      JOIN services s ON s.id = c.sourceService
      WHERE c.targetService = ?
    `).all(serviceId) as any[];

    return rows.map((r) => ({
      service: this.mapService(r),
      connection: {
        id: r.connId,
        sourceService: r.sourceService,
        targetService: r.targetService,
        protocol: r.protocol,
        contractRef: r.contractRef,
        dataFlow: r.dataFlow,
        description: r.connDesc,
        lastVerified: r.lastVerified,
      },
    }));
  }

  findProviders(serviceId: string): { service: GraphService; connection: GraphConnection }[] {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT s.*, c.id as connId, c.sourceService, c.targetService, c.protocol,
             c.contractRef, c.dataFlow, c.description as connDesc, c.lastVerified
      FROM connections c
      JOIN services s ON s.id = c.targetService
      WHERE c.sourceService = ?
    `).all(serviceId) as any[];

    return rows.map((r) => ({
      service: this.mapService(r),
      connection: {
        id: r.connId,
        sourceService: r.sourceService,
        targetService: r.targetService,
        protocol: r.protocol,
        contractRef: r.contractRef,
        dataFlow: r.dataFlow,
        description: r.connDesc,
        lastVerified: r.lastVerified,
      },
    }));
  }

  findPath(fromServiceId: string, toServiceId: string): GraphService[] | null {
    const visited = new Set<string>();
    const queue: { id: string; path: string[] }[] = [{ id: fromServiceId, path: [fromServiceId] }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.id === toServiceId) {
        return current.path.map((id) => this.getService(id)!).filter(Boolean);
      }

      if (visited.has(current.id)) continue;
      visited.add(current.id);

      const connections = this.getConnectionsFrom(current.id);
      for (const conn of connections) {
        if (!visited.has(conn.targetService)) {
          queue.push({ id: conn.targetService, path: [...current.path, conn.targetService] });
        }
      }
    }

    return null;
  }

  // --- Diagram Generation ---

  generateMermaidDiagram(options?: { repoFilter?: string; protocol?: ConnectionProtocol }): GraphDiagram {
    let services = this.getAllServices();
    let connections = this.getAllConnections();

    if (options?.repoFilter) {
      const repoServices = new Set(
        services.filter((s) => s.repoName === options.repoFilter).map((s) => s.id)
      );
      connections = connections.filter(
        (c) => repoServices.has(c.sourceService) || repoServices.has(c.targetService)
      );
      const involvedIds = new Set<string>();
      connections.forEach((c) => { involvedIds.add(c.sourceService); involvedIds.add(c.targetService); });
      services = services.filter((s) => involvedIds.has(s.id));
    }

    if (options?.protocol) {
      connections = connections.filter((c) => c.protocol === options.protocol);
      const involvedIds = new Set<string>();
      connections.forEach((c) => { involvedIds.add(c.sourceService); involvedIds.add(c.targetService); });
      services = services.filter((s) => involvedIds.has(s.id));
    }

    const lines: string[] = ['graph LR'];

    for (const service of services) {
      const label = service.serviceName;
      const shape = service.criticality === 'critical' ? `((${label}))` : `[${label}]`;
      lines.push(`  ${this.mermaidId(service.id)}${shape}`);
    }

    for (const conn of connections) {
      const label = conn.protocol;
      lines.push(`  ${this.mermaidId(conn.sourceService)} -->|${label}| ${this.mermaidId(conn.targetService)}`);
    }

    return {
      mermaid: lines.join('\n'),
      services: services.length,
      connections: connections.length,
    };
  }

  // --- JSON Export ---

  /**
   * Export the full service map as a JSON object.
   * Used by adapters (e.g., Cursor) that cannot depend on better-sqlite3.
   */
  exportServiceMapJson(): { services: any[]; connections: any[]; contracts: any[] } {
    const services = this.getAllServices().map((s) => ({
      id: s.id,
      repoName: s.repoName,
      serviceName: s.serviceName,
      criticality: s.criticality,
      owners: s.owners,
      description: s.description ?? null,
    }));

    const connections = this.getAllConnections().map((c) => ({
      sourceService: c.sourceService,
      targetService: c.targetService,
      protocol: c.protocol,
      description: c.description ?? null,
      dataFlow: c.dataFlow,
    }));

    const contracts = this.getAllContracts().map((c) => ({
      id: c.id,
      type: c.type,
      filePath: c.filePath,
      repoName: c.repoName,
      endpoints: c.endpoints,
      version: c.version ?? null,
    }));

    return { services, connections, contracts };
  }

  // --- Stats ---

  getStats(): { services: number; connections: number; contracts: number; entities: number } {
    const db = this.getDb();
    const services = (db.prepare('SELECT COUNT(*) as c FROM services').get() as any).c;
    const connections = (db.prepare('SELECT COUNT(*) as c FROM connections').get() as any).c;
    const contracts = (db.prepare('SELECT COUNT(*) as c FROM contracts').get() as any).c;
    const entities = (db.prepare('SELECT COUNT(DISTINCT entity) as c FROM data_ownership').get() as any).c;
    return { services, connections, contracts, entities };
  }

  // --- Private helpers ---

  private mapService(row: any): GraphService {
    return {
      id: row.id,
      repoName: row.repoName,
      serviceName: row.serviceName,
      description: row.description ?? undefined,
      owners: row.owners ? JSON.parse(row.owners) : [],
      criticality: row.criticality,
      lastDiscovered: row.lastDiscovered,
    };
  }

  private mapConnection(row: any): GraphConnection {
    return {
      id: row.id,
      sourceService: row.sourceService,
      targetService: row.targetService,
      protocol: row.protocol,
      contractRef: row.contractRef ?? undefined,
      dataFlow: row.dataFlow,
      description: row.description ?? undefined,
      lastVerified: row.lastVerified,
    };
  }

  private mapContract(row: any): GraphContract {
    return {
      id: row.id,
      repoName: row.repoName,
      filePath: row.filePath,
      type: row.type,
      version: row.version ?? undefined,
      endpoints: row.endpoints ? JSON.parse(row.endpoints) : [],
      lastModified: row.lastModified,
    };
  }

  private mermaidId(id: string): string {
    return id.replace(/[^a-zA-Z0-9]/g, '_');
  }

  private getDb(): Database.Database {
    if (!this.db) {
      throw new Error('GraphStore not initialized. Call initialize() first.');
    }
    return this.db;
  }
}
