/**
 * Stage Direction Filtering Utility
 *
 * Provides functions to identify, strip, and transform stage directions
 * (text marked with delimiters like [brackets]) in teleprompter scripts.
 */

export type DelimiterType = 'none' | 'square' | 'round' | 'curly';
export type DisplayMode = 'normal' | 'dimmed' | 'hidden';

/**
 * Get the opening and closing characters for a delimiter type.
 * @param type - The delimiter type
 * @returns Tuple of [open, close] characters, or null if type is 'none'
 */
export function getDelimiterPair(type: DelimiterType): [string, string] | null {
  switch (type) {
    case 'none':
      return null;
    case 'square':
      return ['[', ']'];
    case 'round':
      return ['(', ')'];
    case 'curly':
      return ['{', '}'];
    default:
      return null;
  }
}

/**
 * Find stage directions in text, handling nested brackets properly.
 * Returns array of [start, end] index pairs for each stage direction.
 *
 * For nested brackets like [outer [inner] more], matches the entire outer bracket.
 * For unclosed brackets, matches from open bracket to end of string.
 */
function findStageDirectionRanges(text: string, open: string, close: string): [number, number][] {
  const ranges: [number, number][] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] === open) {
      const start = i;
      let depth = 1;
      i++;

      while (i < text.length && depth > 0) {
        if (text[i] === open) {
          depth++;
        } else if (text[i] === close) {
          depth--;
        }
        i++;
      }

      // If depth > 0, bracket was unclosed - range extends to end
      ranges.push([start, i]);
    } else {
      i++;
    }
  }

  return ranges;
}

/**
 * Strip all stage directions from text.
 * Stage directions are identified by the specified delimiter type.
 *
 * @param text - The input text
 * @param delimiter - The delimiter type to use for identifying stage directions
 * @returns Text with all stage directions removed
 */
export function stripStageDirections(text: string, delimiter: DelimiterType): string {
  const pair = getDelimiterPair(delimiter);
  if (!pair) {
    return text;
  }

  const [open, close] = pair;
  const ranges = findStageDirectionRanges(text, open, close);

  if (ranges.length === 0) {
    return text;
  }

  // Build result by copying non-stage-direction parts
  let result = '';
  let lastEnd = 0;

  for (const [start, end] of ranges) {
    result += text.slice(lastEnd, start);
    lastEnd = end;
  }

  result += text.slice(lastEnd);
  return result;
}

/**
 * Transform stage directions for display based on the display mode.
 *
 * - 'normal': Keep text unchanged
 * - 'dimmed': Convert delimiters to parentheses (visual distinction)
 * - 'hidden': Remove stage directions entirely
 *
 * @param text - The input text
 * @param delimiter - The delimiter type identifying stage directions
 * @param displayMode - How to display stage directions
 * @returns Transformed text
 */
export function transformStageDirectionsForDisplay(
  text: string,
  delimiter: DelimiterType,
  displayMode: DisplayMode
): string {
  const pair = getDelimiterPair(delimiter);
  if (!pair) {
    return text;
  }

  switch (displayMode) {
    case 'normal':
      return text;

    case 'hidden':
      return stripStageDirections(text, delimiter);

    case 'dimmed': {
      const [open, close] = pair;
      // If already parentheses, keep as-is
      if (open === '(' && close === ')') {
        return text;
      }

      const ranges = findStageDirectionRanges(text, open, close);
      if (ranges.length === 0) {
        return text;
      }

      // Build result, replacing delimiters with parentheses
      let result = '';
      let lastEnd = 0;

      for (const [start, end] of ranges) {
        result += text.slice(lastEnd, start);
        // Extract content (without the delimiters)
        const content = text.slice(start + 1, text[end - 1] === close ? end - 1 : end);
        result += `(${content})`;
        lastEnd = end;
      }

      result += text.slice(lastEnd);
      return result;
    }

    default:
      return text;
  }
}
