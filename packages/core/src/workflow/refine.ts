/**
 * Requirement refinement engine.
 * MVP implementation uses templates; LLM integration added when connected to the AI tool.
 */
export class RefinementEngine {
  /**
   * Generate a structured requirement document from raw input.
   */
  async refine(rawRequirement: string): Promise<string> {
    const sections = [
      this.generateSummary(rawRequirement),
      this.generateUserStories(rawRequirement),
      this.generateAcceptanceCriteriaSection(rawRequirement),
      this.generateEdgeCases(rawRequirement),
      this.generateRisks(rawRequirement),
      this.generateOpenQuestions(rawRequirement),
    ];

    return sections.join('\n\n');
  }

  /**
   * Generate clarifying questions based on requirement keywords.
   */
  async generateQuestions(requirement: string): Promise<string[]> {
    const questions: string[] = [];
    const lower = requirement.toLowerCase();

    // Always ask these
    questions.push('What is the expected user persona for this feature?');
    questions.push('What is the priority/timeline for delivery?');

    // Conditional questions based on keywords
    if (lower.includes('api') || lower.includes('endpoint') || lower.includes('service')) {
      questions.push('What authentication/authorization is required for the API?');
      questions.push('What are the expected request/response payload shapes?');
      questions.push('What error scenarios should the API handle?');
    }

    if (lower.includes('ui') || lower.includes('screen') || lower.includes('page') || lower.includes('component')) {
      questions.push('Is there a Figma design or wireframe available?');
      questions.push('What devices/screen sizes must be supported?');
      questions.push('Are there accessibility requirements?');
    }

    if (lower.includes('data') || lower.includes('model') || lower.includes('database') || lower.includes('schema')) {
      questions.push('What is the expected data volume?');
      questions.push('Are there existing data models this relates to?');
      questions.push('What are the data retention requirements?');
    }

    if (lower.includes('notification') || lower.includes('email') || lower.includes('push')) {
      questions.push('What notification channels are required (push, email, SMS)?');
      questions.push('What triggers the notification?');
    }

    if (lower.includes('auth') || lower.includes('login') || lower.includes('permission')) {
      questions.push('What roles/permissions are involved?');
      questions.push('Is this integrated with an existing auth provider?');
    }

    if (lower.includes('upload') || lower.includes('file') || lower.includes('image') || lower.includes('media')) {
      questions.push('What file types and size limits are acceptable?');
      questions.push('Where should files be stored (S3, local, CDN)?');
    }

    if (lower.includes('search') || lower.includes('filter') || lower.includes('query')) {
      questions.push('What fields should be searchable?');
      questions.push('Is full-text search required or simple filtering?');
    }

    return questions;
  }

  /**
   * Generate acceptance criteria in Given/When/Then format.
   */
  async generateAcceptanceCriteria(requirement: string): Promise<string[]> {
    const criteria: string[] = [];
    const lower = requirement.toLowerCase();

    // Base criteria
    criteria.push(
      `Given a user accesses the feature\nWhen the feature loads\nThen it should render without errors`
    );

    if (lower.includes('api') || lower.includes('endpoint')) {
      criteria.push(
        `Given a valid request is sent to the endpoint\nWhen the server processes it\nThen it should return the expected response with correct status code`
      );
      criteria.push(
        `Given an invalid request is sent\nWhen the server processes it\nThen it should return an appropriate error response (4xx)`
      );
    }

    if (lower.includes('ui') || lower.includes('screen') || lower.includes('form')) {
      criteria.push(
        `Given the user fills in all required fields\nWhen they submit the form\nThen the data should be saved and a success message displayed`
      );
      criteria.push(
        `Given the user leaves required fields empty\nWhen they attempt to submit\nThen validation errors should be shown inline`
      );
    }

    if (lower.includes('list') || lower.includes('table') || lower.includes('display')) {
      criteria.push(
        `Given data exists in the system\nWhen the user views the list\nThen all relevant items should be displayed with correct formatting`
      );
      criteria.push(
        `Given no data exists\nWhen the user views the list\nThen an appropriate empty state should be shown`
      );
    }

    if (lower.includes('delete') || lower.includes('remove')) {
      criteria.push(
        `Given the user initiates deletion\nWhen they confirm the action\nThen the item should be removed and the UI updated`
      );
    }

    if (lower.includes('edit') || lower.includes('update') || lower.includes('modify')) {
      criteria.push(
        `Given the user modifies data\nWhen they save changes\nThen the updated data should persist and be reflected in the UI`
      );
    }

    return criteria;
  }

  private generateSummary(requirement: string): string {
    return `# Feature Requirement\n\n## Summary\n\n${requirement}`;
  }

  private generateUserStories(requirement: string): string {
    return `## User Stories\n\n- As a user, I want to ${requirement.toLowerCase().replace(/^(i want to |add |create |build |implement )/i, '')}, so that I can achieve my goal efficiently.\n- As a developer, I want clear acceptance criteria, so that I know when the feature is complete.`;
  }

  private generateAcceptanceCriteriaSection(requirement: string): string {
    const lower = requirement.toLowerCase();
    const criteria: string[] = [];

    criteria.push('- [ ] Feature works as described in the summary');
    criteria.push('- [ ] Error states are handled gracefully');
    criteria.push('- [ ] Tests cover happy path and edge cases');

    if (lower.includes('api') || lower.includes('endpoint')) {
      criteria.push('- [ ] API returns correct status codes');
      criteria.push('- [ ] Input validation is implemented');
    }

    if (lower.includes('ui') || lower.includes('screen')) {
      criteria.push('- [ ] UI matches design specifications');
      criteria.push('- [ ] Responsive across target devices');
    }

    return `## Acceptance Criteria\n\n${criteria.join('\n')}`;
  }

  private generateEdgeCases(requirement: string): string {
    const cases: string[] = [];
    cases.push('- Empty/null input handling');
    cases.push('- Concurrent access scenarios');
    cases.push('- Network failure / timeout handling');
    cases.push('- Large data volume performance');

    return `## Edge Cases\n\n${cases.join('\n')}`;
  }

  private generateRisks(requirement: string): string {
    const risks: string[] = [];
    risks.push('- Performance impact on existing features');
    risks.push('- Backward compatibility with existing data');
    risks.push('- Security implications of new data flows');

    return `## Risks\n\n${risks.join('\n')}`;
  }

  private generateOpenQuestions(requirement: string): string {
    return `## Open Questions\n\n- [ ] Are there dependencies on other in-flight features?\n- [ ] What is the rollback strategy if issues arise post-deployment?`;
  }
}
