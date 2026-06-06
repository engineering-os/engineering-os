export function shannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;

  const freq: Record<string, number> = {};
  for (const ch of str) {
    freq[ch] = (freq[ch] || 0) + 1;
  }

  const len = str.length;
  let entropy = 0;

  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

export function isHighEntropy(str: string, threshold = 4.5, minLength = 20): boolean {
  if (str.length < minLength) return false;
  return shannonEntropy(str) > threshold;
}
