import { describe, it, expect } from 'vitest';
import { estimateTokens } from './token-estimator';
import { BudgetTracker } from './budget-tracker';
import { BudgetEnforcer } from './budget-enforcer';
import { getStageForTool } from './stage-mapping';

describe('estimateTokens', () => {
  it('estimates tokens as content.length / 4', () => {
    expect(estimateTokens('hello world')).toBe(3); // 11 / 4 = 2.75 → 3
  });

  it('handles empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('handles large content', () => {
    const content = 'a'.repeat(4000);
    expect(estimateTokens(content)).toBe(1000);
  });
});

describe('getStageForTool', () => {
  it('maps eos_refine to refinement', () => {
    expect(getStageForTool('eos_refine')).toBe('refinement');
  });

  it('maps eos_search to implementation', () => {
    expect(getStageForTool('eos_search')).toBe('implementation');
  });

  it('maps eos_review to qa', () => {
    expect(getStageForTool('eos_review')).toBe('qa');
  });

  it('returns null for exempt tools', () => {
    expect(getStageForTool('eos_index')).toBeNull();
    expect(getStageForTool('eos_status')).toBeNull();
    expect(getStageForTool('eos_health')).toBeNull();
    expect(getStageForTool('eos_decide')).toBeNull();
  });
});

describe('BudgetTracker', () => {
  it('starts with full budgets', () => {
    const tracker = new BudgetTracker({
      refinement: 50000, design: 80000, planning: 40000,
      implementation: 200000, qa: 100000, totalFeature: 1000000,
    });
    const status = tracker.getRemainingBudget('refinement');
    expect(status.stageRemaining).toBe(50000);
    expect(status.stagePct).toBe(0);
  });

  it('records emission and updates remaining', () => {
    const tracker = new BudgetTracker({
      refinement: 50000, design: 80000, planning: 40000,
      implementation: 200000, qa: 100000, totalFeature: 1000000,
    });
    tracker.recordEmission('feat-1', 'refinement', 10000);
    const status = tracker.getRemainingBudget('refinement', 'feat-1');
    expect(status.stageRemaining).toBe(40000);
    expect(status.featureRemaining).toBe(990000);
  });

  it('detects over budget', () => {
    const tracker = new BudgetTracker({
      refinement: 1000, design: 80000, planning: 40000,
      implementation: 200000, qa: 100000, totalFeature: 1000000,
    });
    tracker.recordEmission(null, 'refinement', 1000);
    expect(tracker.isOverBudget('refinement')).toBe(true);
  });

  it('generates warning at threshold', () => {
    const tracker = new BudgetTracker({
      refinement: 10000, design: 80000, planning: 40000,
      implementation: 200000, qa: 100000, totalFeature: 1000000,
    });
    tracker.recordEmission(null, 'refinement', 8500);
    const warning = tracker.getWarning('refinement', null, 0.8);
    expect(warning).toContain('refinement');
    expect(warning).toContain('85%');
  });

  it('no warning below threshold', () => {
    const tracker = new BudgetTracker({
      refinement: 10000, design: 80000, planning: 40000,
      implementation: 200000, qa: 100000, totalFeature: 1000000,
    });
    tracker.recordEmission(null, 'refinement', 5000);
    const warning = tracker.getWarning('refinement', null, 0.8);
    expect(warning).toBeNull();
  });

  it('resets feature budget', () => {
    const tracker = new BudgetTracker({
      refinement: 50000, design: 80000, planning: 40000,
      implementation: 200000, qa: 100000, totalFeature: 1000000,
    });
    tracker.recordEmission('feat-1', 'refinement', 10000);
    tracker.reset('feat-1');
    const status = tracker.getRemainingBudget('refinement', 'feat-1');
    expect(status.featureRemaining).toBe(1000000);
  });

  it('provides usage summary', () => {
    const tracker = new BudgetTracker({
      refinement: 50000, design: 80000, planning: 40000,
      implementation: 200000, qa: 100000, totalFeature: 1000000,
    });
    tracker.recordEmission('feat-1', 'refinement', 25000);
    tracker.recordEmission('feat-1', 'design', 40000);
    const summary = tracker.getUsageSummary('feat-1');
    expect(summary.refinement.pct).toBe(50);
    expect(summary.design.pct).toBe(50);
    expect(summary.totalFeature.used).toBe(65000);
  });
});

describe('BudgetEnforcer', () => {
  const budgets = {
    refinement: 50000, design: 80000, planning: 40000,
    implementation: 200000, qa: 100000, totalFeature: 1000000,
  };

  it('passes through exempt tools without enforcement', () => {
    const tracker = new BudgetTracker(budgets);
    const enforcer = new BudgetEnforcer(tracker, { mode: 'hard', warnThreshold: 0.8 }, budgets);
    const result = enforcer.enforce('eos_index', null, 'Indexed 100 files');
    expect(result.rejected).toBe(false);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe('Indexed 100 files');
  });

  it('soft mode truncates when over budget', () => {
    const smallBudgets = { ...budgets, refinement: 100 };
    const tracker = new BudgetTracker(smallBudgets);
    tracker.recordEmission(null, 'refinement', 80);
    const enforcer = new BudgetEnforcer(tracker, { mode: 'soft', warnThreshold: 0.8 }, smallBudgets);
    const longResponse = 'a'.repeat(400); // 100 tokens, but only 20 remaining
    const result = enforcer.enforce('eos_refine', null, longResponse);
    expect(result.truncated).toBe(true);
    expect(result.tokensEmitted).toBeLessThan(100);
  });

  it('hard mode rejects when over budget', () => {
    const smallBudgets = { ...budgets, refinement: 100 };
    const tracker = new BudgetTracker(smallBudgets);
    tracker.recordEmission(null, 'refinement', 100);
    const enforcer = new BudgetEnforcer(tracker, { mode: 'hard', warnThreshold: 0.8 }, smallBudgets);
    const result = enforcer.enforce('eos_refine', null, 'any response');
    expect(result.rejected).toBe(true);
    expect(result.text).toContain('Budget exceeded');
  });

  it('nolimit mode never enforces', () => {
    const smallBudgets = { ...budgets, refinement: 10 };
    const tracker = new BudgetTracker(smallBudgets);
    tracker.recordEmission(null, 'refinement', 100);
    const enforcer = new BudgetEnforcer(tracker, { mode: 'nolimit', warnThreshold: 0.8 }, smallBudgets);
    const result = enforcer.enforce('eos_refine', null, 'a'.repeat(1000));
    expect(result.rejected).toBe(false);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe('a'.repeat(1000));
  });

  it('nolimit mode still tracks and warns', () => {
    const smallBudgets = { ...budgets, refinement: 100 };
    const tracker = new BudgetTracker(smallBudgets);
    tracker.recordEmission(null, 'refinement', 90);
    const enforcer = new BudgetEnforcer(tracker, { mode: 'nolimit', warnThreshold: 0.8 }, smallBudgets);
    const result = enforcer.enforce('eos_refine', null, 'hello');
    expect(result.warning).toContain('refinement');
  });

  it('computes multi-repo limit with even strategy', () => {
    const tracker = new BudgetTracker(budgets);
    const enforcer = new BudgetEnforcer(
      tracker,
      { mode: 'soft', warnThreshold: 0.8, multiRepo: { strategy: 'even' } },
      budgets
    );
    const limit = enforcer.getMultiRepoLimit(4, 'implementation');
    expect(limit).toBe(50000); // 200000 / 4
  });

  it('computes multi-repo limit with fixed strategy', () => {
    const tracker = new BudgetTracker(budgets);
    const enforcer = new BudgetEnforcer(
      tracker,
      { mode: 'soft', warnThreshold: 0.8, multiRepo: { strategy: 'fixed', perRepoLimit: 20000 } },
      budgets
    );
    const limit = enforcer.getMultiRepoLimit(4, 'implementation');
    expect(limit).toBe(20000);
  });

  it('nolimit returns Infinity for multi-repo', () => {
    const tracker = new BudgetTracker(budgets);
    const enforcer = new BudgetEnforcer(tracker, { mode: 'nolimit', warnThreshold: 0.8 }, budgets);
    const limit = enforcer.getMultiRepoLimit(4, 'implementation');
    expect(limit).toBe(Infinity);
  });
});
