import { Threat, ThreatCategory, ThreatModel, Severity } from '@engineering-os/shared';

interface ThreatPattern {
  keywords: RegExp;
  category: ThreatCategory;
  title: string;
  description: string;
  severity: Severity;
  mitigations: string[];
}

const THREAT_PATTERNS: ThreatPattern[] = [
  // Spoofing
  {
    keywords: /\b(?:login|auth|sign.?in|credentials|password|token|session|jwt|oauth)\b/i,
    category: 'spoofing',
    title: 'Authentication Bypass',
    description: 'An attacker may spoof identity by bypassing authentication mechanisms.',
    severity: 'high',
    mitigations: ['Implement multi-factor authentication', 'Use established auth frameworks', 'Rate-limit login attempts', 'Log failed authentication'],
  },
  {
    keywords: /\b(?:api.?key|bearer|authorization.?header|cookie)\b/i,
    category: 'spoofing',
    title: 'Token/Key Impersonation',
    description: 'An attacker may steal or forge tokens/keys to impersonate legitimate users.',
    severity: 'high',
    mitigations: ['Rotate tokens regularly', 'Use short-lived tokens', 'Validate token scope', 'Implement token revocation'],
  },
  // Tampering
  {
    keywords: /\b(?:database|db|sql|insert|update|delete|mutation|write)\b/i,
    category: 'tampering',
    title: 'Data Tampering',
    description: 'An attacker may modify data in transit or at rest without authorization.',
    severity: 'high',
    mitigations: ['Validate all inputs', 'Use parameterized queries', 'Implement integrity checks', 'Use audit logs for data changes'],
  },
  {
    keywords: /\b(?:file.?upload|upload|attachment|blob|storage)\b/i,
    category: 'tampering',
    title: 'Malicious File Upload',
    description: 'An attacker may upload malicious files to compromise the system.',
    severity: 'high',
    mitigations: ['Validate file types and sizes', 'Scan uploads for malware', 'Store files outside web root', 'Use content-disposition headers'],
  },
  // Repudiation
  {
    keywords: /\b(?:payment|transaction|order|purchase|refund|billing)\b/i,
    category: 'repudiation',
    title: 'Transaction Repudiation',
    description: 'A user may deny performing a transaction without adequate logging.',
    severity: 'medium',
    mitigations: ['Implement comprehensive audit logging', 'Use tamper-proof logs', 'Record timestamps and user IDs', 'Store transaction receipts'],
  },
  // Information Disclosure
  {
    keywords: /\b(?:pii|personal.?data|email|phone|ssn|address|user.?data|profile)\b/i,
    category: 'information-disclosure',
    title: 'PII Exposure',
    description: 'Personal data may be exposed through insecure handling or logging.',
    severity: 'high',
    mitigations: ['Encrypt PII at rest and in transit', 'Minimize data collection', 'Mask sensitive fields in logs', 'Implement data access controls'],
  },
  {
    keywords: /\b(?:error|exception|stack.?trace|debug|verbose|log)\b/i,
    category: 'information-disclosure',
    title: 'Information Leakage via Errors',
    description: 'Detailed error messages may reveal internal system information to attackers.',
    severity: 'medium',
    mitigations: ['Use generic error messages for clients', 'Log detailed errors server-side only', 'Disable debug mode in production', 'Sanitize error responses'],
  },
  // Denial of Service
  {
    keywords: /\b(?:api|endpoint|request|webhook|public.?facing|rate|throttl)\b/i,
    category: 'denial-of-service',
    title: 'API/Endpoint Abuse',
    description: 'Public-facing endpoints may be overwhelmed by malicious traffic.',
    severity: 'medium',
    mitigations: ['Implement rate limiting', 'Use request size limits', 'Deploy behind CDN/WAF', 'Add circuit breakers'],
  },
  {
    keywords: /\b(?:queue|worker|background|batch|cron|process)\b/i,
    category: 'denial-of-service',
    title: 'Resource Exhaustion',
    description: 'Background processes may be overwhelmed by excessive workload.',
    severity: 'medium',
    mitigations: ['Set queue depth limits', 'Implement backpressure', 'Monitor resource usage', 'Add timeout policies'],
  },
  // Elevation of Privilege
  {
    keywords: /\b(?:admin|role|permission|rbac|access.?control|privilege|sudo|superuser)\b/i,
    category: 'elevation-of-privilege',
    title: 'Privilege Escalation',
    description: 'An attacker may gain elevated access beyond their authorized role.',
    severity: 'critical',
    mitigations: ['Implement principle of least privilege', 'Validate roles on every request', 'Separate admin and user contexts', 'Audit privilege changes'],
  },
  {
    keywords: /\b(?:third.?party|external|integration|webhook|callback|redirect)\b/i,
    category: 'elevation-of-privilege',
    title: 'Third-Party Trust Exploitation',
    description: 'External integrations may be compromised to gain unauthorized access.',
    severity: 'high',
    mitigations: ['Validate all external inputs', 'Use allowlists for redirects', 'Verify webhook signatures', 'Isolate third-party permissions'],
  },
];

const DATA_FLOW_PATTERNS = [
  /\b(?:api|endpoint|route|handler)\b/i,
  /\b(?:database|db|store|repository|cache|redis)\b/i,
  /\b(?:queue|message|event|stream|kafka|rabbitmq)\b/i,
  /\b(?:file|storage|s3|blob|upload|download)\b/i,
  /\b(?:email|notification|sms|push)\b/i,
  /\b(?:external|third.?party|webhook|integration)\b/i,
];

const TRUST_BOUNDARY_PATTERNS = [
  /\b(?:client|frontend|browser|mobile|user.?input)\b/i,
  /\b(?:auth|authentication|authorization|middleware)\b/i,
  /\b(?:public|private|internal|external)\b/i,
  /\b(?:network|firewall|vpc|dmz)\b/i,
];

export class ThreatModeler {
  analyze(featureSlug: string, specification: string, components?: string[]): ThreatModel {
    const dataFlows = this.detectDataFlows(specification);
    const trustBoundaries = this.detectTrustBoundaries(specification);
    const threats = this.identifyThreats(specification, components);
    const recommendations = this.generateRecommendations(threats);

    return {
      featureSlug,
      timestamp: new Date().toISOString(),
      dataFlows,
      trustBoundaries,
      threats,
      recommendations,
    };
  }

  private detectDataFlows(spec: string): string[] {
    const flows: string[] = [];
    const sentences = spec.split(/[.;\n]+/);

    for (const sentence of sentences) {
      for (const pattern of DATA_FLOW_PATTERNS) {
        if (pattern.test(sentence) && sentence.trim().length > 10) {
          flows.push(sentence.trim().slice(0, 100));
          break;
        }
      }
    }

    return [...new Set(flows)].slice(0, 10);
  }

  private detectTrustBoundaries(spec: string): string[] {
    const boundaries: string[] = [];

    for (const pattern of TRUST_BOUNDARY_PATTERNS) {
      const matches = spec.match(new RegExp(`[^.;\\n]*${pattern.source}[^.;\\n]*`, 'gi'));
      if (matches) {
        for (const m of matches.slice(0, 2)) {
          boundaries.push(m.trim().slice(0, 80));
        }
      }
    }

    return [...new Set(boundaries)].slice(0, 8);
  }

  private identifyThreats(spec: string, components?: string[]): Threat[] {
    const threats: Threat[] = [];
    let threatId = 0;

    for (const pattern of THREAT_PATTERNS) {
      if (pattern.keywords.test(spec)) {
        threatId++;
        const affectedComponent = components
          ? this.findRelevantComponent(spec, pattern.keywords, components)
          : 'System';

        threats.push({
          id: `THREAT-${threatId}`,
          category: pattern.category,
          title: pattern.title,
          description: pattern.description,
          severity: pattern.severity,
          affectedComponent,
          mitigations: pattern.mitigations,
        });
      }
    }

    return threats;
  }

  private findRelevantComponent(spec: string, keyword: RegExp, components: string[]): string {
    const match = keyword.exec(spec);
    if (!match) return components[0] || 'System';

    const context = spec.substring(Math.max(0, match.index - 50), match.index + match[0].length + 50);
    for (const component of components) {
      if (context.toLowerCase().includes(component.toLowerCase())) {
        return component;
      }
    }
    return components[0] || 'System';
  }

  private generateRecommendations(threats: Threat[]): string[] {
    const recommendations: string[] = [];

    const critical = threats.filter((t) => t.severity === 'critical');
    const high = threats.filter((t) => t.severity === 'high');

    if (critical.length > 0) {
      recommendations.push(`Address ${critical.length} critical threat(s) before deployment: ${critical.map((t) => t.title).join(', ')}`);
    }
    if (high.length > 0) {
      recommendations.push(`Plan mitigation for ${high.length} high-severity threat(s) in current sprint`);
    }
    if (threats.some((t) => t.category === 'spoofing')) {
      recommendations.push('Conduct authentication review — ensure all identity claims are verified');
    }
    if (threats.some((t) => t.category === 'information-disclosure')) {
      recommendations.push('Review data handling — ensure PII is encrypted, minimized, and masked in logs');
    }
    if (threats.some((t) => t.category === 'denial-of-service')) {
      recommendations.push('Implement rate limiting and resource caps on all public-facing endpoints');
    }

    return recommendations;
  }
}
