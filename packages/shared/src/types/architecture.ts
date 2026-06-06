/** A service/module model discovered from code */
export interface ServiceModel {
  name: string;
  description: string;
  owners: string[];
  publicApis: string[];
  dependencies: string[];
  patterns: string[];
  criticality: 'low' | 'medium' | 'high' | 'critical';
}

/** A coding pattern discovered or defined */
export interface Pattern {
  name: string;
  description: string;
  files: string[];
  usage: string;
}

/** A team coding convention */
export interface Convention {
  name: string;
  description: string;
  rule: string;
  examples: string[];
}
