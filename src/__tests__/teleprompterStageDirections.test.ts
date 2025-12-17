import { describe, expect, test, beforeEach } from 'bun:test';

/**
 * Integration tests for stage direction handling in TeleprompterManager.
 *
 * These tests verify that:
 * 1. Stage directions are stripped from text used for speech matching
 * 2. Stage directions are transformed correctly for display
 * 3. Line wrapping works correctly with stage directions
 *
 * We test the core logic by importing TeleprompterManager directly.
 */

// Import the manager - we'll need to extract testable methods or test via public interface
// For now, we'll test the integration at a higher level

import {
  stripStageDirections,
  transformStageDirectionsForDisplay,
  type DelimiterType,
  type DisplayMode,
} from '../utils/src/stageDirections';

describe('Stage Direction Integration Scenarios', () => {
  describe('Speech matching text preparation', () => {
    // Simulate what TeleprompterManager should do: strip stage directions before speech matching

    test('spoken text should match script with stage directions stripped', () => {
      const script = 'Hello everyone [wave to audience] welcome to the show';
      const spokenText = 'Hello everyone welcome to the show';

      const scriptForMatching = stripStageDirections(script, 'square');
      // After stripping, there's a double space where the stage direction was
      expect(scriptForMatching).toBe('Hello everyone  welcome to the show');

      // Normalize both for comparison (similar to what speech matching does)
      const normalizedScript = scriptForMatching.toLowerCase().replace(/\s+/g, ' ').trim();
      const normalizedSpoken = spokenText.toLowerCase().replace(/\s+/g, ' ').trim();

      // After whitespace normalization, they should match
      expect(normalizedScript).toBe(normalizedSpoken);
    });

    test('multi-line stage directions should be stripped for speech matching', () => {
      const script = `Welcome to the presentation.
[Pause for applause.
Wait for audience to settle.]
Let's begin with the first topic.`;

      const stripped = stripStageDirections(script, 'square');
      expect(stripped).toBe(`Welcome to the presentation.

Let's begin with the first topic.`);
    });

    test('stage directions at speech boundaries should not interfere', () => {
      const script = '[Clear throat] Good morning [pause] everyone';
      const stripped = stripStageDirections(script, 'square');
      expect(stripped).toBe(' Good morning  everyone');
    });
  });

  describe('Display transformation scenarios', () => {
    const script = 'Hello [wave] there [smile] friend';

    test('normal mode preserves original formatting', () => {
      const result = transformStageDirectionsForDisplay(script, 'square', 'normal');
      expect(result).toBe(script);
    });

    test('dimmed mode converts to parentheses for visual distinction', () => {
      const result = transformStageDirectionsForDisplay(script, 'square', 'dimmed');
      expect(result).toBe('Hello (wave) there (smile) friend');
    });

    test('hidden mode removes stage directions completely', () => {
      const result = transformStageDirectionsForDisplay(script, 'square', 'hidden');
      expect(result).toBe('Hello  there  friend');
    });
  });

  describe('Line wrapping considerations', () => {
    // When stage directions are hidden, text should be wrapped AFTER stripping
    // This ensures line lengths are calculated correctly

    test('hidden stage directions should not affect line width calculations', () => {
      // A line that would be too long with stage directions
      const script = 'Short text [very long stage direction that would overflow] end';

      // After stripping, the text is much shorter
      const stripped = stripStageDirections(script, 'square');
      expect(stripped).toBe('Short text  end');

      // This short text should fit on one line (hypothetically <40 chars)
      expect(stripped.length).toBeLessThan(40);
    });

    test('dimmed stage directions should preserve content for wrapping', () => {
      const script = 'Hello [wave] world';
      const dimmed = transformStageDirectionsForDisplay(script, 'square', 'dimmed');

      // Content length is similar (just different delimiters)
      expect(dimmed).toBe('Hello (wave) world');
      expect(dimmed.length).toBe(script.length);
    });
  });

  describe('Edge cases for integration', () => {
    test('empty script with only stage directions', () => {
      const script = '[This is all stage directions]';
      const stripped = stripStageDirections(script, 'square');
      expect(stripped).toBe('');

      const dimmed = transformStageDirectionsForDisplay(script, 'square', 'dimmed');
      expect(dimmed).toBe('(This is all stage directions)');
    });

    test('script with no stage directions is unchanged', () => {
      const script = 'Just regular text without any markers';
      expect(stripStageDirections(script, 'square')).toBe(script);
      expect(transformStageDirectionsForDisplay(script, 'square', 'dimmed')).toBe(script);
      expect(transformStageDirectionsForDisplay(script, 'square', 'hidden')).toBe(script);
    });

    test('delimiter none returns text unchanged', () => {
      const script = 'Hello [bracketed] text';
      expect(stripStageDirections(script, 'none')).toBe(script);
      expect(transformStageDirectionsForDisplay(script, 'none', 'hidden')).toBe(script);
    });

    test('wrong delimiter type does not match', () => {
      const script = 'Hello [square] and (round) and {curly}';

      // Square delimiter only strips square brackets
      expect(stripStageDirections(script, 'square')).toBe('Hello  and (round) and {curly}');

      // Round delimiter only strips parentheses
      expect(stripStageDirections(script, 'round')).toBe('Hello [square] and  and {curly}');

      // Curly delimiter only strips curly braces
      expect(stripStageDirections(script, 'curly')).toBe('Hello [square] and (round) and ');
    });
  });

  describe('Unclosed delimiter edge cases', () => {
    test('unclosed bracket at start strips everything after it', () => {
      const script = '[Unclosed stage direction that goes on and on';
      const stripped = stripStageDirections(script, 'square');
      expect(stripped).toBe('');

      const dimmed = transformStageDirectionsForDisplay(script, 'square', 'dimmed');
      // Dimmed mode completes the parenthesis for proper display
      expect(dimmed).toBe('(Unclosed stage direction that goes on and on)');

      const hidden = transformStageDirectionsForDisplay(script, 'square', 'hidden');
      expect(hidden).toBe('');
    });

    test('unclosed bracket in middle strips from bracket to end', () => {
      const script = 'This is normal text [but this bracket never closes and keeps going';
      const stripped = stripStageDirections(script, 'square');
      expect(stripped).toBe('This is normal text ');

      const dimmed = transformStageDirectionsForDisplay(script, 'square', 'dimmed');
      // Dimmed mode completes the parenthesis for proper display
      expect(dimmed).toBe('This is normal text (but this bracket never closes and keeps going)');

      const hidden = transformStageDirectionsForDisplay(script, 'square', 'hidden');
      expect(hidden).toBe('This is normal text ');
    });

    test('unclosed bracket spanning large multi-line section', () => {
      const script = `First paragraph of normal text.

[Stage direction that starts here
and continues for many lines
with various content
including more text
and even more content
that never gets closed

This would all be considered part of the stage direction
since there is no closing bracket.`;

      const stripped = stripStageDirections(script, 'square');
      // Only the first paragraph should remain
      expect(stripped).toBe(`First paragraph of normal text.

`);
      expect(stripped).not.toContain('Stage direction');
      expect(stripped).not.toContain('never gets closed');

      const hidden = transformStageDirectionsForDisplay(script, 'square', 'hidden');
      expect(hidden).toBe(`First paragraph of normal text.

`);
    });

    test('multiple unclosed brackets - each consumes to next open or end', () => {
      // The first [ consumes until the next [ is found (since no ] exists between)
      // Actually, the algorithm uses depth tracking, so it just goes to end
      const script = 'Text [unclosed one [unclosed two';
      const stripped = stripStageDirections(script, 'square');
      // First [ opens, second [ increases depth to 2, no closes, so entire rest is stripped
      expect(stripped).toBe('Text ');
    });

    test('unclosed bracket with closing brackets after (nested scenario)', () => {
      // [outer [inner] - the inner ] closes inner, but outer remains unclosed
      const script = 'Before [outer [inner] after inner but outer unclosed';
      const stripped = stripStageDirections(script, 'square');
      // [outer opens (depth 1), [inner opens (depth 2), ] closes inner (depth 1)
      // then continues to end since no more ] to close outer
      expect(stripped).toBe('Before ');
    });

    test('unclosed parentheses behave the same way', () => {
      const script = 'Normal text (unclosed parens that continue';
      const stripped = stripStageDirections(script, 'round');
      expect(stripped).toBe('Normal text ');

      const dimmed = transformStageDirectionsForDisplay(script, 'round', 'dimmed');
      // Round uses () for dimmed, but the content already has ( so it becomes ((
      // Actually, transform converts the ( to ( and keeps content, no closing )
      expect(dimmed).toBe('Normal text (unclosed parens that continue');
    });

    test('unclosed curly braces behave the same way', () => {
      const script = 'Normal text {unclosed curly that continue';
      const stripped = stripStageDirections(script, 'curly');
      expect(stripped).toBe('Normal text ');

      const hidden = transformStageDirectionsForDisplay(script, 'curly', 'hidden');
      expect(hidden).toBe('Normal text ');
    });

    test('extra closing brackets are preserved (not stage directions)', () => {
      // A closing bracket without opening is just regular text
      const script = 'Text with extra ] closing bracket';
      const stripped = stripStageDirections(script, 'square');
      expect(stripped).toBe('Text with extra ] closing bracket');
    });

    test('empty unclosed bracket', () => {
      const script = 'Before [';
      const stripped = stripStageDirections(script, 'square');
      expect(stripped).toBe('Before ');
    });

    test('unclosed bracket followed by valid bracket pair', () => {
      // First [ is unclosed and consumes everything including the second [valid]
      const script = 'Start [unclosed middle [valid] end';
      const stripped = stripStageDirections(script, 'square');
      // [unclosed opens (depth 1), [valid opens (depth 2), ] closes (depth 1), end of string
      expect(stripped).toBe('Start ');
    });

    test('line wrapping with unclosed bracket producing large strip', () => {
      // Ensure that when hidden mode strips a large section, the remaining text is reasonable
      const longUnclosedSection = 'A'.repeat(500); // 500 char stage direction
      const script = `Short intro. [${longUnclosedSection}`;

      const stripped = stripStageDirections(script, 'square');
      expect(stripped).toBe('Short intro. ');
      expect(stripped.length).toBeLessThan(20); // Reasonable length for wrapping

      const hidden = transformStageDirectionsForDisplay(script, 'square', 'hidden');
      expect(hidden).toBe('Short intro. ');
      expect(hidden.length).toBeLessThan(20);
    });

    test('dimmed mode with very long unclosed section preserves it', () => {
      const longContent = 'word '.repeat(100); // 500 chars of words
      const script = `Intro [${longContent}`;

      const dimmed = transformStageDirectionsForDisplay(script, 'square', 'dimmed');
      // Should convert [ to ( and add closing ) for proper display
      expect(dimmed.startsWith('Intro (')).toBe(true);
      expect(dimmed.endsWith(')')).toBe(true);
      expect(dimmed).toContain('word');
      // Length is script.length + 1 because ) is added to complete the unclosed bracket
      expect(dimmed.length).toBe(script.length + 1);
    });
  });

  describe('Real-world script examples', () => {
    test('theater-style script with stage directions', () => {
      const script = `[Enter stage left]
Good evening, ladies and gentlemen.
[Pause for effect]
Tonight, I want to share something special with you.
[Walk to center stage]
It's a story about perseverance.`;

      const forSpeech = stripStageDirections(script, 'square');
      expect(forSpeech).not.toContain('[');
      expect(forSpeech).not.toContain(']');
      expect(forSpeech).toContain('Good evening');
      expect(forSpeech).toContain('Tonight');
      expect(forSpeech).toContain('perseverance');

      const forDisplay = transformStageDirectionsForDisplay(script, 'square', 'dimmed');
      expect(forDisplay).toContain('(Enter stage left)');
      expect(forDisplay).toContain('(Pause for effect)');
      expect(forDisplay).not.toContain('[');
    });

    test('presentation with inline notes', () => {
      const script = 'Our revenue increased by 50% [show chart] compared to last year [pause] which exceeded expectations.';

      const forSpeech = stripStageDirections(script, 'square');
      expect(forSpeech).toBe('Our revenue increased by 50%  compared to last year  which exceeded expectations.');

      // Speech matching would normalize whitespace
      const normalized = forSpeech.replace(/\s+/g, ' ');
      expect(normalized).toBe('Our revenue increased by 50% compared to last year which exceeded expectations.');
    });
  });
});
