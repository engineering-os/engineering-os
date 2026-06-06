import { TokenBudgets } from '@engineering-os/shared';
import { getStageForTool, getStageBudget } from './stage-mapping';

export interface BudgetStatus {
  stageRemaining: number;
  featureRemaining: number;
  stagePct: number;
  featurePct: number;
}

export interface UsageSummary {
  [stage: string]: { used: number; limit: number; pct: number };
}

export class BudgetTracker {
  private stageUsage = new Map<string, number>();
  private featureUsage = new Map<string, number>();

  constructor(private budgets: TokenBudgets) {}

  recordEmission(featureSlug: string | null, stage: string, tokens: number): void {
    const current = this.stageUsage.get(stage) ?? 0;
    this.stageUsage.set(stage, current + tokens);

    if (featureSlug) {
      const featureCurrent = this.featureUsage.get(featureSlug) ?? 0;
      this.featureUsage.set(featureSlug, featureCurrent + tokens);
    }
  }

  getRemainingBudget(stage: string, featureSlug?: string): BudgetStatus {
    const stageLimit = (this.budgets as any)[stage] as number | undefined;
    const stageUsed = this.stageUsage.get(stage) ?? 0;
    const stageRemaining = stageLimit ? Math.max(0, stageLimit - stageUsed) : Infinity;
    const stagePct = stageLimit ? stageUsed / stageLimit : 0;

    const featureUsed = featureSlug ? (this.featureUsage.get(featureSlug) ?? 0) : 0;
    const featureRemaining = Math.max(0, this.budgets.totalFeature - featureUsed);
    const featurePct = featureUsed / this.budgets.totalFeature;

    return { stageRemaining, featureRemaining, stagePct, featurePct };
  }

  isOverBudget(stage: string, featureSlug?: string): boolean {
    const status = this.getRemainingBudget(stage, featureSlug);
    return status.stageRemaining === 0 || status.featureRemaining === 0;
  }

  getWarning(stage: string, featureSlug: string | null, warnThreshold: number): string | null {
    const stageLimit = (this.budgets as any)[stage] as number | undefined;
    if (!stageLimit) return null;

    const stageUsed = this.stageUsage.get(stage) ?? 0;
    const pct = stageUsed / stageLimit;

    if (pct >= warnThreshold) {
      return `Budget: ${stage} at ${Math.round(pct * 100)}% (${stageUsed.toLocaleString()}/${stageLimit.toLocaleString()} tokens)`;
    }

    if (featureSlug) {
      const featureUsed = this.featureUsage.get(featureSlug) ?? 0;
      const featurePct = featureUsed / this.budgets.totalFeature;
      if (featurePct >= warnThreshold) {
        return `Budget: feature "${featureSlug}" at ${Math.round(featurePct * 100)}% (${featureUsed.toLocaleString()}/${this.budgets.totalFeature.toLocaleString()} tokens)`;
      }
    }

    return null;
  }

  reset(featureSlug: string): void {
    this.featureUsage.delete(featureSlug);
  }

  resetStage(stage: string): void {
    this.stageUsage.delete(stage);
  }

  getUsageSummary(featureSlug?: string): UsageSummary {
    const stages = ['refinement', 'design', 'planning', 'implementation', 'qa'] as const;
    const summary: UsageSummary = {};

    for (const stage of stages) {
      const used = this.stageUsage.get(stage) ?? 0;
      const limit = this.budgets[stage];
      summary[stage] = { used, limit, pct: limit > 0 ? Math.round((used / limit) * 100) : 0 };
    }

    if (featureSlug) {
      const featureUsed = this.featureUsage.get(featureSlug) ?? 0;
      summary['totalFeature'] = {
        used: featureUsed,
        limit: this.budgets.totalFeature,
        pct: Math.round((featureUsed / this.budgets.totalFeature) * 100),
      };
    }

    return summary;
  }
}
