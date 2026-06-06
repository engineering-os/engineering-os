const SYNONYM_MAP: Record<string, string[]> = {
  auth: ['authentication', 'login', 'session', 'jwt', 'token', 'credentials', 'oauth'],
  authentication: ['auth', 'login', 'session', 'jwt', 'token', 'credentials'],
  login: ['auth', 'authentication', 'sign-in', 'session'],
  api: ['endpoint', 'route', 'handler', 'controller', 'rest'],
  endpoint: ['api', 'route', 'handler', 'controller'],
  database: ['db', 'sql', 'query', 'repository', 'store', 'model'],
  db: ['database', 'sql', 'query', 'repository', 'store'],
  test: ['spec', 'testing', 'unit', 'integration', 'jest', 'vitest'],
  error: ['exception', 'throw', 'catch', 'error-handling', 'failure'],
  config: ['configuration', 'settings', 'options', 'env', 'environment'],
  user: ['account', 'profile', 'member', 'customer'],
  payment: ['billing', 'charge', 'stripe', 'transaction', 'invoice'],
  cache: ['redis', 'memcached', 'memoize', 'store'],
  queue: ['worker', 'job', 'background', 'async', 'event'],
  middleware: ['interceptor', 'guard', 'filter', 'pipe'],
  validate: ['validation', 'schema', 'sanitize', 'check', 'dto'],
  service: ['provider', 'module', 'use-case', 'business-logic'],
  repository: ['dao', 'store', 'data-access', 'persistence'],
  component: ['widget', 'element', 'view', 'ui'],
  hook: ['use', 'effect', 'state', 'lifecycle'],
  style: ['css', 'theme', 'design', 'tailwind', 'styled'],
  deploy: ['ci', 'cd', 'pipeline', 'release', 'build'],
  security: ['auth', 'permission', 'role', 'access-control', 'rbac'],
  log: ['logger', 'logging', 'trace', 'debug', 'monitor'],
  websocket: ['ws', 'socket', 'realtime', 'push', 'event'],
  upload: ['file', 'attachment', 'multipart', 'blob', 'storage'],
};

export function expandQuery(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const variants = new Set<string>();

  // Original query is always included
  variants.add(query);

  // Generate variant with synonyms substituted
  const synonymVariants: string[] = [];
  for (const word of words) {
    const synonyms = SYNONYM_MAP[word];
    if (synonyms) {
      // Add a variant replacing this word with its top synonyms
      for (const syn of synonyms.slice(0, 2)) {
        synonymVariants.push(syn);
      }
    }
  }

  if (synonymVariants.length > 0) {
    variants.add([...words, ...synonymVariants.slice(0, 4)].join(' '));
  }

  // Add a variant with just the key nouns (strip common verbs/prepositions)
  const STOP_WORDS = new Set(['the', 'and', 'for', 'how', 'does', 'what', 'where', 'which', 'this', 'that', 'with', 'from', 'about', 'into']);
  const keyWords = words.filter((w) => !STOP_WORDS.has(w));
  if (keyWords.length > 0 && keyWords.join(' ') !== query.toLowerCase()) {
    variants.add(keyWords.join(' '));
  }

  return Array.from(variants).slice(0, 3);
}
