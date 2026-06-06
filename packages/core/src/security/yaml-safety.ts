import * as yaml from 'js-yaml';

/**
 * Safely load YAML content using JSON_SCHEMA.
 * Prevents object instantiation attacks (!!js/function, !!python/object, etc.)
 * Only allows: strings, numbers, booleans, null, arrays, plain objects.
 */
export function safeYamlLoad<T>(content: string): T | null {
  const result = yaml.load(content, { schema: yaml.JSON_SCHEMA });
  if (result === undefined || result === null) {
    return null;
  }
  return result as T;
}

/**
 * Safely dump an object to YAML string.
 */
export function safeYamlDump(obj: unknown): string {
  return yaml.dump(obj, {
    schema: yaml.JSON_SCHEMA,
    noRefs: true,
    sortKeys: true,
  });
}
