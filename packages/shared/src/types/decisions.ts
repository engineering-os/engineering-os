/** An option considered in an engineering decision */
export interface DecisionOption {
  name: string;
  pros: string[];
  cons: string[];
}

/** An engineering decision record */
export interface Decision {
  id: string;
  title: string;
  status: 'proposed' | 'accepted' | 'deprecated' | 'superseded';
  context: string;
  options: DecisionOption[];
  decision: string;
  rationale: string;
  consequences: string[];
  date: string;
  supersededBy?: string;
  tags: string[];
}
