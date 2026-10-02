/**
 * Computes the Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= bn; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= an; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[bn][an];
}

/**
 * Finds the closest matching candidate from a catalog of known labels.
 * Returns null if distance exceeds threshold.
 */
export function fuzzyMatch(
  query: string,
  candidates: string[],
  maxDistance: number = 2
): { match: string; distance: number } | null {
  const normalizedQuery = query.trim().toLowerCase();
  let bestMatch: string | null = null;
  let minDistance = Infinity;

  for (const candidate of candidates) {
    const normalizedCandidate = candidate.trim().toLowerCase();
    if (normalizedQuery === normalizedCandidate) {
      return { match: candidate, distance: 0 };
    }
    const dist = levenshteinDistance(normalizedQuery, normalizedCandidate);
    if (dist < minDistance && dist <= maxDistance) {
      minDistance = dist;
      bestMatch = candidate;
    }
  }

  if (bestMatch !== null) {
    return { match: bestMatch, distance: minDistance };
  }
  return null;
}
