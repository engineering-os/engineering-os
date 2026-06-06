import type { EmbeddingConfig } from '@engineering-os/shared';

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string;
  private endpoint: string;

  constructor(config: EmbeddingConfig) {
    this.apiKey = config.apiKey || process.env.EOS_EMBEDDING_API_KEY || '';
    this.model = config.model;
    this.endpoint = config.endpoint || 'https://api.openai.com/v1/embeddings';

    if (!this.apiKey) {
      throw new Error(
        `Embedding provider "openai" requires an API key.\n` +
        `Set it in .eos/config.yaml:\n` +
        `  embedding:\n` +
        `    provider: openai\n` +
        `    model: ${this.model}\n` +
        `    apiKey: sk-...\n` +
        `    enabled: true\n` +
        `Or set the EOS_EMBEDDING_API_KEY environment variable.`
      );
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ input: texts, model: this.model }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI embedding API error (${response.status}): ${body.slice(0, 200)}`);
    }

    const data = await response.json() as { data: { embedding: number[] }[] };
    return data.data.map((d) => d.embedding);
  }
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private model: string;
  private endpoint: string;

  constructor(config: EmbeddingConfig) {
    this.model = config.model;
    this.endpoint = config.endpoint || 'http://localhost:11434/api/embeddings';
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (const text of texts) {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding error (${response.status}). Is Ollama running?`);
      }

      const data = await response.json() as { embedding: number[] };
      results.push(data.embedding);
    }

    return results;
  }
}

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  switch (config.provider) {
    case 'openai':
    case 'cohere':
    case 'custom':
      return new OpenAIEmbeddingProvider(config);
    case 'ollama':
      return new OllamaEmbeddingProvider(config);
    default:
      throw new Error(`Unknown embedding provider: ${config.provider}`);
  }
}
