import { describe, it, expect } from 'vitest';
import { XssDetector } from './xss-detector';

describe('XssDetector', () => {
  const detector = new XssDetector();

  it('detects innerHTML assignments', () => {
    const lines = ['element.innerHTML = userInput;'];
    const findings = detector.detect('render.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
  });

  it('detects document.write', () => {
    const lines = ['document.write(data);'];
    const findings = detector.detect('legacy.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].cweId).toBe('CWE-79');
  });

  it('detects eval with dynamic input', () => {
    const lines = ['eval(userCode);'];
    const findings = detector.detect('eval.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
  });

  it('detects dangerouslySetInnerHTML', () => {
    const lines = ['<div dangerouslySetInnerHTML={{ __html: content }} />'];
    const findings = detector.detect('Component.tsx', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
  });

  it('does not flag innerHTML with static string', () => {
    const lines = ['element.innerHTML = "<br>";'];
    const findings = detector.detect('render.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(0);
  });

  it('detects jQuery html() with variable', () => {
    const lines = ['$(selector).html(userContent);'];
    const findings = detector.detect('legacy.js', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
  });
});
