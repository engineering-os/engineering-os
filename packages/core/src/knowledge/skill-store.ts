import * as fs from 'fs';
import * as path from 'path';
import { safeYamlLoad, safeYamlDump } from '../security';

export type SkillType = 'connection' | 'pattern' | 'gotcha' | 'convention' | 'shortcut';

export interface Skill {
  id: string;
  type: SkillType;
  name: string;
  content: string;
  context?: string;
  learnedFrom?: string;
  confidence: 'low' | 'medium' | 'high';
  timesApplied: number;
  createdAt: string;
  lastApplied?: string;
  tags?: string[];
}

export class SkillStore {
  private skillsDir: string;

  constructor(private eosDir: string) {
    this.skillsDir = path.join(eosDir, 'knowledge', 'skills');
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  save(skill: Skill): void {
    this.ensureDir();
    const filePath = path.join(this.skillsDir, `${skill.id}.yaml`);
    const content = safeYamlDump(skill);
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  get(id: string): Skill | null {
    const filePath = path.join(this.skillsDir, `${id}.yaml`);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return safeYamlLoad<Skill>(content);
    } catch {
      return null;
    }
  }

  list(filter?: { type?: SkillType; minConfidence?: string }): Skill[] {
    this.ensureDir();
    const files = fs.readdirSync(this.skillsDir).filter((f) => f.endsWith('.yaml'));
    const skills: Skill[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.skillsDir, file), 'utf-8');
        const skill = safeYamlLoad<Skill>(content);
        if (!skill) continue;

        if (filter?.type && skill.type !== filter.type) continue;
        if (filter?.minConfidence) {
          const order = { low: 1, medium: 2, high: 3 };
          if ((order[skill.confidence] || 0) < (order[filter.minConfidence as keyof typeof order] || 0)) continue;
        }

        skills.push(skill);
      } catch {
        continue;
      }
    }

    return skills.sort((a, b) => b.timesApplied - a.timesApplied);
  }

  search(query: string): Skill[] {
    const all = this.list();
    const lower = query.toLowerCase();

    return all.filter((skill) => {
      const searchable = `${skill.name} ${skill.content} ${skill.context || ''} ${(skill.tags || []).join(' ')}`.toLowerCase();
      return lower.split(/\s+/).some((term) => searchable.includes(term));
    });
  }

  recordApplied(id: string): void {
    const skill = this.get(id);
    if (!skill) return;
    skill.timesApplied++;
    skill.lastApplied = new Date().toISOString();
    if (skill.timesApplied >= 5 && skill.confidence === 'medium') {
      skill.confidence = 'high';
    }
    if (skill.timesApplied >= 2 && skill.confidence === 'low') {
      skill.confidence = 'medium';
    }
    this.save(skill);
  }

  create(input: { type: SkillType; name?: string; content: string; context?: string; tags?: string[] }): Skill {
    const id = this.nextId();
    const skill: Skill = {
      id,
      type: input.type,
      name: input.name || this.inferName(input.content),
      content: input.content,
      context: input.context,
      learnedFrom: `session-${new Date().toISOString().split('T')[0]}`,
      confidence: 'medium',
      timesApplied: 0,
      createdAt: new Date().toISOString(),
      tags: input.tags,
    };
    this.save(skill);
    return skill;
  }

  delete(id: string): boolean {
    const filePath = path.join(this.skillsDir, `${id}.yaml`);
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  getGotchas(): Skill[] {
    return this.list({ type: 'gotcha' });
  }

  getPatterns(): Skill[] {
    return this.list({ type: 'pattern' });
  }

  getShortcuts(): Skill[] {
    return this.list({ type: 'shortcut' });
  }

  getRelevantSkills(taskContext: string): Skill[] {
    const all = this.list();
    const lower = taskContext.toLowerCase();
    const keywords = lower.split(/\s+/).filter((w) => w.length > 3);

    return all.filter((skill) => {
      const skillText = `${skill.name} ${skill.content} ${skill.context || ''} ${(skill.tags || []).join(' ')}`.toLowerCase();
      return keywords.some((kw) => skillText.includes(kw));
    }).slice(0, 10);
  }

  private nextId(): string {
    this.ensureDir();
    const files = fs.readdirSync(this.skillsDir).filter((f) => f.startsWith('SKILL-'));
    if (files.length === 0) return 'SKILL-001';
    const numbers = files.map((f) => {
      const match = f.match(/SKILL-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });
    const next = Math.max(...numbers) + 1;
    return `SKILL-${next.toString().padStart(3, '0')}`;
  }

  private inferName(content: string): string {
    const firstLine = content.split('\n')[0].trim();
    return firstLine.length > 50 ? firstLine.slice(0, 50) + '...' : firstLine;
  }
}
