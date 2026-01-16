import { RoundInfo } from './types';

/**
 * Detect and split multiple interview rounds from scheduling method text
 * Patterns supported:
 * - "Round1: <URL>"
 * - "Round 1: <URL>"
 * - "R1: <URL>"
 * - "R 1: <URL>"
 * - Newline separated
 * - Comma separated
 */
export function splitRounds(schedulingMethod: string): RoundInfo[] {
  if (!schedulingMethod || schedulingMethod.trim() === '') {
    return [];
  }

  const rounds: RoundInfo[] = [];
  const seenRounds = new Set<string>(); // For deduplication

  // Normalize line breaks (handle \r\n, \r, \n)
  const normalized = schedulingMethod.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split by newlines first
  const lines = normalized.split('\n').map(line => line.trim()).filter(line => line);

  for (const line of lines) {
    // Pattern: Round1: URL, Round 1: URL, R1: URL, R 1: URL
    const roundPattern = /^(Round\s*\d+|R\s*\d+)\s*:\s*(.+)$/i;
    const match = line.match(roundPattern);

    if (match) {
      const roundName = normalizeRoundName(match[1]);
      const url = match[2].trim();

      // Deduplicate
      if (!seenRounds.has(roundName)) {
        seenRounds.add(roundName);
        rounds.push({
          roundName,
          roundLink: extractUrl(url)
        });
      }
    } else if (line.toLowerCase().startsWith('round') || line.toLowerCase().startsWith('r')) {
      // Try to extract round name even without URL
      const roundOnlyPattern = /^(Round\s*\d+|R\s*\d+)/i;
      const roundMatch = line.match(roundOnlyPattern);
      if (roundMatch) {
        const roundName = normalizeRoundName(roundMatch[1]);
        if (!seenRounds.has(roundName)) {
          seenRounds.add(roundName);
          rounds.push({
            roundName,
            roundLink: null
          });
        }
      }
    } else if (isUrl(line)) {
      // If line is just a URL without round prefix, try to infer round number
      const inferredRoundName = `Round ${rounds.length + 1}`;
      if (!seenRounds.has(inferredRoundName)) {
        seenRounds.add(inferredRoundName);
        rounds.push({
          roundName: inferredRoundName,
          roundLink: line
        });
      }
    }
  }

  // If no rounds detected but there's content, treat as single round
  if (rounds.length === 0 && schedulingMethod.trim()) {
    const url = extractUrl(schedulingMethod);
    rounds.push({
      roundName: 'Round 1',
      roundLink: url
    });
  }

  return rounds;
}

/**
 * Normalize round name to consistent format: "Round 1", "Round 2", etc.
 */
function normalizeRoundName(roundName: string): string {
  // Extract number from round name
  const match = roundName.match(/(\d+)/);
  if (match) {
    return `Round ${match[1]}`;
  }
  return roundName;
}

/**
 * Extract URL from text
 */
function extractUrl(text: string): string | null {
  if (!text) return null;

  // Look for URL pattern
  const urlPattern = /(https?:\/\/[^\s]+)/i;
  const match = text.match(urlPattern);

  if (match) {
    return match[1];
  }

  // Check if entire text looks like a URL
  if (isUrl(text)) {
    return text;
  }

  return null;
}

/**
 * Check if text is a valid URL
 */
function isUrl(text: string): boolean {
  if (!text) return false;

  try {
    const url = new URL(text.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
