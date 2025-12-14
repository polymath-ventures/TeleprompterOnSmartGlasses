import { describe, expect, test } from 'bun:test';
import {
  type DelimiterType,
  type DisplayMode,
  getDelimiterPair,
  stripStageDirections,
  transformStageDirectionsForDisplay,
} from '../utils/src/stageDirections';

describe('getDelimiterPair', () => {
  test('returns null for "none"', () => {
    expect(getDelimiterPair('none')).toBeNull();
  });

  test('returns square brackets for "square"', () => {
    expect(getDelimiterPair('square')).toEqual(['[', ']']);
  });

  test('returns parentheses for "round"', () => {
    expect(getDelimiterPair('round')).toEqual(['(', ')']);
  });

  test('returns curly braces for "curly"', () => {
    expect(getDelimiterPair('curly')).toEqual(['{', '}']);
  });
});

describe('stripStageDirections', () => {
  describe('with delimiter "none"', () => {
    test('returns text unchanged', () => {
      const text = 'Hello [world] there';
      expect(stripStageDirections(text, 'none')).toBe(text);
    });
  });

  describe('with square brackets', () => {
    test('strips single stage direction', () => {
      expect(stripStageDirections('Hello [wave] there', 'square'))
        .toBe('Hello  there');
    });

    test('strips multiple stage directions', () => {
      expect(stripStageDirections('Hello [wave] there [smile] friend', 'square'))
        .toBe('Hello  there  friend');
    });

    test('strips stage direction at start', () => {
      expect(stripStageDirections('[wave] Hello there', 'square'))
        .toBe(' Hello there');
    });

    test('strips stage direction at end', () => {
      expect(stripStageDirections('Hello there [wave]', 'square'))
        .toBe('Hello there ');
    });

    test('handles multi-line stage direction', () => {
      const text = 'Hello [this is a\nmulti-line\nstage direction] there';
      expect(stripStageDirections(text, 'square'))
        .toBe('Hello  there');
    });

    test('handles unclosed bracket - extends to end', () => {
      const text = 'Hello [unclosed stage direction';
      expect(stripStageDirections(text, 'square'))
        .toBe('Hello ');
    });

    test('returns empty string when entire text is stage direction', () => {
      expect(stripStageDirections('[entire text is direction]', 'square'))
        .toBe('');
    });

    test('handles text with no stage directions', () => {
      expect(stripStageDirections('Hello there friend', 'square'))
        .toBe('Hello there friend');
    });

    test('handles empty text', () => {
      expect(stripStageDirections('', 'square'))
        .toBe('');
    });

    test('handles nested brackets - greedy to outermost close', () => {
      // [outer [inner] still outer] should all be stripped
      expect(stripStageDirections('Hello [outer [inner] still outer] there', 'square'))
        .toBe('Hello  there');
    });

    test('handles consecutive stage directions', () => {
      expect(stripStageDirections('Hello [one][two] there', 'square'))
        .toBe('Hello  there');
    });
  });

  describe('with parentheses', () => {
    test('strips stage directions in parentheses', () => {
      expect(stripStageDirections('Hello (wave) there', 'round'))
        .toBe('Hello  there');
    });

    test('does not strip square brackets when using round', () => {
      expect(stripStageDirections('Hello [wave] there', 'round'))
        .toBe('Hello [wave] there');
    });
  });

  describe('with curly braces', () => {
    test('strips stage directions in curly braces', () => {
      expect(stripStageDirections('Hello {wave} there', 'curly'))
        .toBe('Hello  there');
    });

    test('does not strip square brackets when using curly', () => {
      expect(stripStageDirections('Hello [wave] there', 'curly'))
        .toBe('Hello [wave] there');
    });
  });
});

describe('transformStageDirectionsForDisplay', () => {
  describe('with delimiter "none"', () => {
    test('returns text unchanged regardless of display mode', () => {
      const text = 'Hello [world] there';
      expect(transformStageDirectionsForDisplay(text, 'none', 'normal')).toBe(text);
      expect(transformStageDirectionsForDisplay(text, 'none', 'dimmed')).toBe(text);
      expect(transformStageDirectionsForDisplay(text, 'none', 'hidden')).toBe(text);
    });
  });

  describe('with square brackets', () => {
    describe('normal mode', () => {
      test('returns text unchanged', () => {
        expect(transformStageDirectionsForDisplay('Hello [wave] there', 'square', 'normal'))
          .toBe('Hello [wave] there');
      });
    });

    describe('dimmed mode', () => {
      test('converts brackets to parentheses', () => {
        expect(transformStageDirectionsForDisplay('Hello [wave] there', 'square', 'dimmed'))
          .toBe('Hello (wave) there');
      });

      test('handles multiple stage directions', () => {
        expect(transformStageDirectionsForDisplay('Hello [wave] there [smile]', 'square', 'dimmed'))
          .toBe('Hello (wave) there (smile)');
      });

      test('handles multi-line stage direction', () => {
        const text = 'Hello [multi\nline] there';
        expect(transformStageDirectionsForDisplay(text, 'square', 'dimmed'))
          .toBe('Hello (multi\nline) there');
      });
    });

    describe('hidden mode', () => {
      test('removes stage directions entirely', () => {
        expect(transformStageDirectionsForDisplay('Hello [wave] there', 'square', 'hidden'))
          .toBe('Hello  there');
      });

      test('handles multi-line stage direction', () => {
        const text = 'Hello [multi\nline] there';
        expect(transformStageDirectionsForDisplay(text, 'square', 'hidden'))
          .toBe('Hello  there');
      });
    });
  });

  describe('with parentheses', () => {
    describe('dimmed mode', () => {
      test('keeps parentheses (already dimmed style)', () => {
        expect(transformStageDirectionsForDisplay('Hello (wave) there', 'round', 'dimmed'))
          .toBe('Hello (wave) there');
      });
    });

    describe('hidden mode', () => {
      test('removes stage directions', () => {
        expect(transformStageDirectionsForDisplay('Hello (wave) there', 'round', 'hidden'))
          .toBe('Hello  there');
      });
    });
  });

  describe('with curly braces', () => {
    describe('dimmed mode', () => {
      test('converts curly braces to parentheses', () => {
        expect(transformStageDirectionsForDisplay('Hello {wave} there', 'curly', 'dimmed'))
          .toBe('Hello (wave) there');
      });
    });

    describe('hidden mode', () => {
      test('removes stage directions', () => {
        expect(transformStageDirectionsForDisplay('Hello {wave} there', 'curly', 'hidden'))
          .toBe('Hello  there');
      });
    });
  });
});
