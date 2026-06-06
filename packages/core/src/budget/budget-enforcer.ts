import { BudgetEnforcementConfig, TokenBudgets } from '@engineering-os/shared';
import { BudgetTracker } from './budget-tracker';
import { getStageForTool, getStageBudget } from './stage-mapping';
import { estimateTokens } from './token-estimator';

export interface EnforcementResult {
  text: string;
  tokensEmitted: number;
  truncated: boolean;
  warning: string | null;
  rejected: boolean;
}

export class BudgetEnforcer {
  constructor(
    private tracker: BudgetTracker,
    private config: BudgetEnforcementConfig,
    private budgets: TokenBudgets
  ) {}

  enforce(toolName: string, featureSlug: string | null, response: string): EnforcementResult {
    const stage = getStageForTool(toolName);

    // Tools not mapped to a stage are always exempt
    if (!stage) {
      const tokens = estimateTokens(response);
      return { text: response, tokensEmitted: tokens, truncated: false, warning: null, rejected: false };
    }

    // nolimit mode: track but never enforce
    if (this.config.mode === 'nolimit') {
      const tokens = estimateTokens(response);
      this.tracker.recordEmission(featureSlug, stage, tokens);
      const warning = this.tracker.getWarning(stage, featureSlug, this.config.warnThreshold);
      return { text: response, tokensEmitted: tokens, truncated: false, warning, rejected: false };
    }

    const tokens = estimateTokens(response);
    const status = this.tracker.getRemainingBudget(stage, featureSlug ?? undefined);
    const remaining = Math.min(status.stageRemaining, status.featureRemaining);

    // Hard mode: reject if already over budget
    if (this.config.mode === 'hard' && remaining === 0) {
      const stageLimit = getStageBudget(this.budgets, stage);
      return {
        text: `Budget exceeded for ${stage}: limit is ${stageLimit.toLocaleString()} tokens. Increase in .eos/config.yaml or switch to enforcement mode: soft.`,
        tokensEmitted: 0,
        truncated: false,
        warning: null,
        rejected: true,
      };
    }

    // Soft mode: truncate if would exceed
    let finalText = response;
    let truncated = false;

    if (this.config.mode === 'soft' && tokens > remaining && remaining < Infinity) {
      const maxChars = remaining * 4;
      finalText = this.truncateAtBoundary(response, maxChars);
      truncated = true;
    }

    const finalTokens = estimateTokens(finalText);
    this.tracker.recordEmission(featureSlug, stage, finalTokens);

    const warning = this.tracker.getWarning(stage, featureSlug, this.config.warnThreshold);

    return {
      text: finalText,
      tokensEmitted: finalTokens,
      truncated,
      warning: truncated
        ? `Response truncated to fit ${stage} budget (${remaining.toLocaleString()} tokens remaining).`
        : warning,
      rejected: false,
    };
  }

  getMultiRepoLimit(totalRepos: number, stage: string): number {
    if (this.config.mode === 'nolimit') return Infinity;

    const multiRepo = this.config.multiRepo;
    if (multiRepo?.strategy === 'fixed' && multiRepo.perRepoLimit) {
      return multiRepo.perRepoLimit;
    }

    // Even strategy: split stage budget across repos
    const stageLimit = (this.budgets as any)[stage] as number | undefined;
    if (!stageLimit || totalRepos === 0) return Infinity;
    return Math.floor(stageLimit / totalRepos);
  }

  private truncateAtBoundary(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;

    // Try to truncate at a newline boundary
    const truncated = text.slice(0, maxChars);
    const lastNewline = truncated.lastIndexOf('\n');
    if (lastNewline > maxChars * 0.7) {
      return truncated.slice(0, lastNewline) + '\n\n[... truncated due to budget limit]';
    }
    return truncated + '\n\n[... truncated due to budget limit]';
  }
}
