import {
  CrossRepoContext,
  GraphService,
  GraphContract,
  ServiceConsumer,
  ServiceProvider,
  ConnectionProtocol,
} from '@engineering-os/shared';
import { GraphStore } from './graph-store';
import { RepoRegistry } from '../multi-repo/repo-registry';
import { MetadataStore } from '../knowledge/metadata-store';
import * as path from 'path';

export class CrossRepoContextBuilder {
  constructor(
    private graphStore: GraphStore,
    private repoRegistry: RepoRegistry
  ) {}

  async buildContext(repoName: string, task: string, options?: { maxTokens?: number }): Promise<CrossRepoContext> {
    const maxTokens = options?.maxTokens ?? 4000;

    const services = this.graphStore.getServicesByRepo(repoName);
    const currentService = services.length > 0 ? this.selectBestService(services, task) : undefined;

    if (!currentService) {
      return { consumers: [], providers: [], relevantContracts: [], conventions: [], warnings: [] };
    }

    const consumers = this.buildConsumerList(currentService.id);
    const providers = this.buildProviderList(currentService.id);
    const relevantContracts = this.findRelevantContracts(currentService, task);
    const conventions = await this.findCrossRepoConventions(repoName);
    const warnings = this.generateWarnings(currentService, consumers, providers);

    return {
      currentService,
      consumers: this.fitToTokenBudget(consumers, maxTokens / 3),
      providers: this.fitToTokenBudget(providers, maxTokens / 3),
      relevantContracts: relevantContracts.slice(0, 5),
      conventions,
      warnings,
    };
  }

  formatForContext(ctx: CrossRepoContext): string {
    if (!ctx.currentService && ctx.consumers.length === 0 && ctx.providers.length === 0) {
      return '';
    }

    const sections: string[] = [];

    if (ctx.currentService) {
      sections.push(`## Current Service: ${ctx.currentService.serviceName} (${ctx.currentService.repoName})`);
      if (ctx.currentService.description) {
        sections.push(ctx.currentService.description);
      }
    }

    if (ctx.consumers.length > 0) {
      sections.push('\n## Services That Consume This Service');
      sections.push('Changes here may affect these downstream services:');
      for (const consumer of ctx.consumers) {
        const endpoints = consumer.endpoints.length > 0 ? ` (${consumer.endpoints.join(', ')})` : '';
        sections.push(`- **${consumer.service.serviceName}** (${consumer.service.repoName}) via ${consumer.protocol}${endpoints}`);
      }
    }

    if (ctx.providers.length > 0) {
      sections.push('\n## Services This Depends On');
      sections.push('This service consumes:');
      for (const provider of ctx.providers) {
        const endpoints = provider.endpoints.length > 0 ? ` (${provider.endpoints.join(', ')})` : '';
        sections.push(`- **${provider.service.serviceName}** (${provider.service.repoName}) via ${provider.protocol}${endpoints}`);
      }
    }

    if (ctx.relevantContracts.length > 0) {
      sections.push('\n## API Contracts');
      for (const contract of ctx.relevantContracts) {
        sections.push(`- **${contract.type}**: ${contract.filePath} (${contract.repoName})`);
        const endpointPreview = contract.endpoints.slice(0, 5);
        for (const ep of endpointPreview) {
          sections.push(`  - ${ep.method ?? ''} ${ep.path}`);
        }
        if (contract.endpoints.length > 5) {
          sections.push(`  - ... and ${contract.endpoints.length - 5} more`);
        }
      }
    }

    if (ctx.conventions.length > 0) {
      sections.push('\n## Cross-Repo Conventions');
      for (const conv of ctx.conventions) {
        sections.push(`- ${conv}`);
      }
    }

    if (ctx.warnings.length > 0) {
      sections.push('\n## Warnings');
      for (const warning of ctx.warnings) {
        sections.push(`- ${warning}`);
      }
    }

    return sections.join('\n');
  }

  private buildConsumerList(serviceId: string): ServiceConsumer[] {
    const consumers = this.graphStore.findConsumers(serviceId);
    const grouped = new Map<string, { service: GraphService; protocols: Set<ConnectionProtocol>; endpoints: Set<string> }>();

    for (const { service, connection } of consumers) {
      if (!grouped.has(service.id)) {
        grouped.set(service.id, { service, protocols: new Set(), endpoints: new Set() });
      }
      const entry = grouped.get(service.id)!;
      entry.protocols.add(connection.protocol);
      if (connection.contractRef) {
        entry.endpoints.add(connection.contractRef);
      }
    }

    return Array.from(grouped.values()).map(({ service, protocols, endpoints }) => ({
      service,
      protocol: Array.from(protocols)[0],
      endpoints: Array.from(endpoints),
    }));
  }

  private buildProviderList(serviceId: string): ServiceProvider[] {
    const providers = this.graphStore.findProviders(serviceId);
    const grouped = new Map<string, { service: GraphService; protocols: Set<ConnectionProtocol>; endpoints: Set<string> }>();

    for (const { service, connection } of providers) {
      if (!grouped.has(service.id)) {
        grouped.set(service.id, { service, protocols: new Set(), endpoints: new Set() });
      }
      const entry = grouped.get(service.id)!;
      entry.protocols.add(connection.protocol);
      if (connection.contractRef) {
        entry.endpoints.add(connection.contractRef);
      }
    }

    return Array.from(grouped.values()).map(({ service, protocols, endpoints }) => ({
      service,
      protocol: Array.from(protocols)[0],
      endpoints: Array.from(endpoints),
    }));
  }

  private findRelevantContracts(service: GraphService, task: string): GraphContract[] {
    const allContracts = this.graphStore.getAllContracts();
    const taskLower = task.toLowerCase();

    return allContracts
      .filter((c) => {
        if (c.repoName === service.repoName) return true;

        return c.endpoints.some((ep) =>
          taskLower.includes(ep.path.toLowerCase()) ||
          (ep.name && taskLower.includes(ep.name.toLowerCase()))
        );
      })
      .sort((a, b) => {
        const aOwn = a.repoName === service.repoName ? 0 : 1;
        const bOwn = b.repoName === service.repoName ? 0 : 1;
        return aOwn - bOwn;
      });
  }

  private async findCrossRepoConventions(repoName: string): Promise<string[]> {
    const conventions: string[] = [];

    const allServices = this.graphStore.getAllServices();
    const repoCount = new Set(allServices.map((s) => s.repoName)).size;

    if (repoCount > 1) {
      const connections = this.graphStore.getAllConnections();
      const protocols = new Set(connections.map((c) => c.protocol));

      if (protocols.has('rest')) {
        conventions.push('When modifying REST endpoints, maintain backward compatibility for all consumers.');
      }
      if (protocols.has('event')) {
        conventions.push('Event schema changes must be backward-compatible (additive only).');
      }
      if (protocols.has('grpc')) {
        conventions.push('Proto file changes must follow gRPC backward compatibility rules.');
      }
      if (protocols.has('import')) {
        conventions.push('Shared package changes affect all importing services — ensure semver compliance.');
      }
    }

    return conventions;
  }

  private generateWarnings(service: GraphService, consumers: ServiceConsumer[], providers: ServiceProvider[]): string[] {
    const warnings: string[] = [];

    const criticalConsumers = consumers.filter((c) => c.service.criticality === 'critical');
    if (criticalConsumers.length > 0) {
      warnings.push(
        `CRITICAL: ${criticalConsumers.map((c) => c.service.serviceName).join(', ')} depend on this service. ` +
        'Breaking changes require coordination.'
      );
    }

    if (consumers.length >= 5) {
      warnings.push(`This service has ${consumers.length} consumers — changes have high blast radius.`);
    }

    return warnings;
  }

  private selectBestService(services: GraphService[], task: string): GraphService {
    const taskLower = task.toLowerCase();
    for (const service of services) {
      if (taskLower.includes(service.serviceName.toLowerCase())) {
        return service;
      }
    }
    return services[0];
  }

  private fitToTokenBudget<T>(items: T[], maxTokens: number): T[] {
    let tokens = 0;
    const result: T[] = [];
    for (const item of items) {
      const itemTokens = Math.ceil(JSON.stringify(item).length / 4);
      if (tokens + itemTokens > maxTokens) break;
      result.push(item);
      tokens += itemTokens;
    }
    return result;
  }
}
