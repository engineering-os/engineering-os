import {
  ImpactResult,
  AffectedService,
  GraphService,
  GraphConnection,
  GraphContract,
} from '@engineering-os/shared';
import { GraphStore } from './graph-store';

const CRITICALITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export class ImpactAnalyzer {
  constructor(private graphStore: GraphStore) {}

  analyzeFileChange(repoName: string, filePath: string): ImpactResult {
    const services = this.graphStore.getServicesByRepo(repoName);
    const changedService = this.findServiceForFile(services, filePath, repoName);

    if (!changedService) {
      return {
        changedService: `${repoName}/unknown`,
        changedFile: filePath,
        affectedServices: [],
        affectedContracts: [],
        riskLevel: 'low',
        summary: `File ${filePath} does not belong to a known service in ${repoName}.`,
      };
    }

    const isContractFile = this.isContractFile(filePath);
    const consumers = this.graphStore.findConsumers(changedService.id);

    const affectedServices: AffectedService[] = consumers.map(({ service, connection }) => ({
      serviceId: service.id,
      repoName: service.repoName,
      serviceName: service.serviceName,
      protocol: connection.protocol,
      contractRef: connection.contractRef,
      criticality: service.criticality,
      reason: isContractFile
        ? `Consumes contract file ${filePath} via ${connection.protocol}`
        : `Depends on ${changedService.serviceName} via ${connection.protocol}`,
    }));

    const affectedContracts = this.findAffectedContracts(repoName, filePath);
    const riskLevel = this.computeRiskLevel(affectedServices, isContractFile);

    const summary = this.buildSummary(changedService, affectedServices, isContractFile, filePath);

    return {
      changedService: changedService.id,
      changedFile: filePath,
      affectedServices,
      affectedContracts: affectedContracts.map((c) => c.id),
      riskLevel,
      summary,
    };
  }

  analyzeServiceChange(serviceId: string): ImpactResult {
    const service = this.graphStore.getService(serviceId);
    if (!service) {
      return {
        changedService: serviceId,
        changedFile: '',
        affectedServices: [],
        affectedContracts: [],
        riskLevel: 'low',
        summary: `Service ${serviceId} not found in the graph.`,
      };
    }

    const allAffected = this.traceTransitiveDependents(serviceId);
    const contracts = this.graphStore.getContractsByRepo(service.repoName);

    const riskLevel = this.computeRiskLevel(allAffected, true);
    const summary = this.buildSummary(service, allAffected, true, '');

    return {
      changedService: serviceId,
      changedFile: '',
      affectedServices: allAffected,
      affectedContracts: contracts.map((c) => c.id),
      riskLevel,
      summary,
    };
  }

  analyzeEndpointChange(repoName: string, endpointPath: string, method?: string): ImpactResult {
    const contracts = this.graphStore.getContractsByRepo(repoName);
    const matchingContracts = contracts.filter((c) =>
      c.endpoints.some((e) =>
        e.path === endpointPath && (!method || e.method === method)
      )
    );

    if (matchingContracts.length === 0) {
      return {
        changedService: `${repoName}/unknown`,
        changedFile: endpointPath,
        affectedServices: [],
        affectedContracts: [],
        riskLevel: 'low',
        summary: `Endpoint ${method ?? ''} ${endpointPath} not found in any known contract.`,
      };
    }

    const services = this.graphStore.getServicesByRepo(repoName);
    const serviceId = services.length > 0 ? services[0].id : `${repoName}/unknown`;
    const consumers = this.graphStore.findConsumers(serviceId);

    const affectedServices: AffectedService[] = consumers.map(({ service, connection }) => ({
      serviceId: service.id,
      repoName: service.repoName,
      serviceName: service.serviceName,
      protocol: connection.protocol,
      contractRef: connection.contractRef,
      criticality: service.criticality,
      reason: `Consumes endpoint ${method ?? ''} ${endpointPath}`,
    }));

    const riskLevel = this.computeRiskLevel(affectedServices, true);
    const summary = `Endpoint ${method ?? ''} ${endpointPath} is consumed by ${affectedServices.length} service(s). ` +
      (affectedServices.length > 0
        ? `Affected: ${affectedServices.map((s) => s.serviceName).join(', ')}.`
        : 'No known consumers.');

    return {
      changedService: serviceId,
      changedFile: endpointPath,
      affectedServices,
      affectedContracts: matchingContracts.map((c) => c.id),
      riskLevel,
      summary,
    };
  }

  private traceTransitiveDependents(serviceId: string, maxDepth: number = 3): AffectedService[] {
    const visited = new Set<string>();
    const result: AffectedService[] = [];
    const queue: { id: string; depth: number }[] = [{ id: serviceId, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;
      if (visited.has(current.id)) continue;
      visited.add(current.id);

      const consumers = this.graphStore.findConsumers(current.id);
      for (const { service, connection } of consumers) {
        if (visited.has(service.id)) continue;

        result.push({
          serviceId: service.id,
          repoName: service.repoName,
          serviceName: service.serviceName,
          protocol: connection.protocol,
          contractRef: connection.contractRef,
          criticality: service.criticality,
          reason: current.depth === 0
            ? `Directly depends on ${serviceId} via ${connection.protocol}`
            : `Transitively depends on ${serviceId} (depth: ${current.depth + 1})`,
        });

        queue.push({ id: service.id, depth: current.depth + 1 });
      }
    }

    return result;
  }

  private findServiceForFile(services: GraphService[], filePath: string, repoName: string): GraphService | null {
    if (services.length === 0) return null;
    if (services.length === 1) return services[0];

    for (const service of services) {
      if (filePath.includes(service.serviceName)) return service;
    }

    return services[0];
  }

  private isContractFile(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    return lower.includes('openapi') || lower.includes('swagger') ||
      lower.endsWith('.proto') || lower.endsWith('.graphql') || lower.endsWith('.gql') ||
      lower.includes('event-schema') || lower.includes('events/');
  }

  private findAffectedContracts(repoName: string, filePath: string): GraphContract[] {
    const contracts = this.graphStore.getContractsByRepo(repoName);
    return contracts.filter((c) => c.filePath === filePath || filePath.includes(c.filePath));
  }

  private computeRiskLevel(affected: AffectedService[], isContractChange: boolean): ImpactResult['riskLevel'] {
    if (affected.length === 0) return 'low';

    const maxCriticality = Math.max(...affected.map((s) => CRITICALITY_ORDER[s.criticality] ?? 1));

    if (maxCriticality >= 4 || (isContractChange && affected.length >= 3)) return 'critical';
    if (maxCriticality >= 3 || (isContractChange && affected.length >= 2)) return 'high';
    if (maxCriticality >= 2 || affected.length >= 2) return 'medium';
    return 'low';
  }

  private buildSummary(
    changedService: GraphService,
    affected: AffectedService[],
    isContractChange: boolean,
    filePath: string
  ): string {
    const parts: string[] = [];

    if (isContractChange) {
      parts.push(`Contract change in ${changedService.serviceName} (${changedService.repoName}).`);
    } else {
      parts.push(`Change in ${changedService.serviceName} (${changedService.repoName}).`);
    }

    if (affected.length === 0) {
      parts.push('No downstream services affected.');
    } else {
      parts.push(`${affected.length} downstream service(s) affected:`);
      const grouped = new Map<string, AffectedService[]>();
      for (const s of affected) {
        const key = s.repoName;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(s);
      }
      for (const [repo, services] of grouped) {
        parts.push(`  ${repo}: ${services.map((s) => s.serviceName).join(', ')}`);
      }
    }

    return parts.join('\n');
  }
}
