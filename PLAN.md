# Stage Direction Filtering Feature - Implementation Plan

## Overview
Add the ability to mark text in the teleprompter script as "stage directions" using configurable delimiters (e.g., `[square brackets]`). Stage directions will be ignored by speech recognition matching but can be displayed normally, dimmed, or hidden based on user preference.

## Settings to Add

### 1. Stage Direction Delimiter (`stage_direction_delimiter`)
- **Type**: select
- **Default**: `"none"` (feature disabled)
- **Options**:
  - `"none"` - Disabled
  - `"square"` - `[Square brackets]`
  - `"round"` - `(Parentheses)`
  - `"curly"` - `{Curly braces}`

### 2. Stage Direction Display Mode (`stage_direction_display`)
- **Type**: select
- **Default**: `"dimmed"`
- **Options**:
  - `"normal"` - Show unchanged
  - `"dimmed"` - Show in parentheses (visual distinction)
  - `"hidden"` - Don't display

## Technical Design

### Key Behaviors
1. **Multi-line support**: Stage directions can span multiple lines
2. **Unclosed brackets**: Treat as extending to end of document (user's responsibility to fix)
3. **Strip BEFORE wrapping**: For hidden mode, remove stage directions before line wrapping so line lengths are correct
4. **Speech matching**: Always strip stage directions from searchable text regardless of display mode
5. **Progress calculation**: Based on displayed text (hidden mode = shorter text = progress reflects what user sees)

### New Utility Module: `src/utils/src/stageDirections.ts`
```typescript
// Types
type DelimiterType = 'none' | 'square' | 'round' | 'curly';
type DisplayMode = 'normal' | 'dimmed' | 'hidden';

// Functions
function getDelimiterPair(type: DelimiterType): [string, string] | null;
function stripStageDirections(text: string, delimiter: DelimiterType): string;
function transformStageDirectionsForDisplay(text: string, delimiter: DelimiterType, displayMode: DisplayMode): string;
```

### Changes to `TeleprompterManager`

1. **New properties**:
   - `stageDirectionDelimiter: DelimiterType`
   - `stageDirectionDisplay: DisplayMode`
   - `textForSpeechMatching: string` (stripped version)

2. **Modified `processText()`**:
   - Store original text
   - Create stripped version for speech matching
   - For hidden mode: wrap the stripped text
   - For normal/dimmed: wrap the original text

3. **Modified `findSpeechMatchPosition()`**:
   - Use `textForSpeechMatching` instead of raw `lines[]`

4. **Modified `getCurrentVisibleText()`**:
   - Apply display transformation (dimming) if needed

### Changes to `tpa_config.json`
Add new settings group and two settings.

### Changes to `TeleprompterApp.applySettings()`
Read and apply the two new settings.

---

## Implementation Checklist

### Phase 1: Test Infrastructure Setup
- [ ] Install bun test dependencies (if needed)
- [ ] Create test directory structure: `src/__tests__/`
- [ ] Verify `bun test` works locally (without Docker)

### Phase 2: Stage Direction Utility (TDD)
- [ ] Write tests for `getDelimiterPair()`
- [ ] Implement `getDelimiterPair()`
- [ ] Write tests for `stripStageDirections()`:
  - [ ] Basic single-line: `"Hello [world] there"` → `"Hello there"`
  - [ ] Multi-line stage direction
  - [ ] Multiple stage directions in text
  - [ ] Unclosed bracket (extends to end)
  - [ ] Empty result after stripping
  - [ ] No stage directions present
  - [ ] Nested brackets (greedy match to outermost close)
  - [ ] Each delimiter type (square, round, curly)
  - [ ] `"none"` delimiter returns text unchanged
- [ ] Implement `stripStageDirections()`
- [ ] Write tests for `transformStageDirectionsForDisplay()`:
  - [ ] Normal mode: unchanged
  - [ ] Dimmed mode: `[text]` → `(text)`
  - [ ] Hidden mode: removes entirely
  - [ ] Multi-line transformations
- [ ] Implement `transformStageDirectionsForDisplay()`

### Phase 3: TeleprompterManager Integration (TDD)
- [ ] Extract testable parts of TeleprompterManager or create integration tests
- [ ] Write tests for speech matching with stage directions:
  - [ ] Stage direction words are NOT matched
  - [ ] Words around stage directions match correctly
  - [ ] Position calculation accounts for stripped text
- [ ] Implement `textForSpeechMatching` property and logic
- [ ] Write tests for display output:
  - [ ] Hidden mode produces correct wrapped lines
  - [ ] Dimmed mode transforms display correctly
  - [ ] Progress percentage is correct for each mode
- [ ] Implement display transformations

### Phase 4: Settings Integration
- [ ] Add settings to `tpa_config.json`
- [ ] Add settings handlers in `setupSettingsHandlers()`
- [ ] Add settings application in `applySettings()`
- [ ] Add setter methods to `TeleprompterManager`

### Phase 5: Final Verification
- [ ] Run full test suite
- [ ] Run linter: `npx eslint 'src/**/*.ts'`
- [ ] Run build: `bun run build`
- [ ] Manual testing scenarios (if possible):
  - [ ] Toggle delimiter types
  - [ ] Toggle display modes
  - [ ] Speech recognition ignores stage directions
- [ ] Update README if needed

### Phase 6: PR Preparation
- [ ] Review all changes
- [ ] Commit with descriptive message
- [ ] Push to fork
- [ ] Create PR to upstream

---

## Test File Structure
```
src/
├── __tests__/
│   ├── stageDirections.test.ts    # Unit tests for utility functions
│   └── teleprompterManager.test.ts # Integration tests for manager
├── utils/
│   └── src/
│       └── stageDirections.ts      # New utility module
└── index.ts                        # Modified
```

## Risk Mitigation
- **Breaking existing functionality**: All existing behavior preserved when `delimiter = "none"`
- **Performance**: Regex operations are fast; only run when feature enabled
- **Edge cases**: Comprehensive test coverage for bracket edge cases
