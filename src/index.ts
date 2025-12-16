// augmentos_cloud/packages/apps/teleprompter/src/index.ts
import path from 'path';
import {
  TpaServer,
  TpaSession,
  ViewType,
} from '@mentra/sdk';
import { TranscriptProcessor } from './utils/src/text-wrapping/TranscriptProcessor';
import { convertLineWidth } from './utils/src/text-wrapping/convertLineWidth';
import {
  stripStageDirections,
  transformStageDirectionsForDisplay,
  type DelimiterType,
  type DisplayMode,
} from './utils/src/stageDirections';

// =============================================================================
// Configuration Constants
// =============================================================================

// Server configuration
const DEFAULT_PORT = 3000;
const PORT = process.env.PORT ? parseInt(process.env.PORT) : DEFAULT_PORT;
const PACKAGE_NAME = process.env.PACKAGE_NAME;
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY || process.env.AUGMENTOS_API_KEY;

// Teleprompter display defaults
const DEFAULT_LINE_WIDTH = 38;
const DEFAULT_SCROLL_SPEED_WPM = 120;
const DEFAULT_NUMBER_OF_LINES = 4;
const MAX_SCROLL_SPEED_WPM = 500;
const MIN_SCROLL_SPEED_WPM = 1;

// Timing constants (in milliseconds)
const SCROLL_INTERVAL_MS = 500;           // Update display twice per second
const INITIAL_DISPLAY_DELAY_MS = 1000;    // Delay before showing initial text
const SCROLL_START_DELAY_MS = 5000;       // Delay before scrolling begins
const FINAL_LINE_DISPLAY_MS = 5000;       // How long to show final line
const END_MESSAGE_DISPLAY_MS = 10000;     // How long to show "END OF TEXT"
const AUTO_REPLAY_DELAY_MS = 5000;        // Delay before auto-replay
const DISPLAY_TIMEOUT_MS = 10000;         // SDK display timeout

// Speech matching configuration
const SPEECH_BUFFER_SIZE_FINAL = 20;      // Buffer size for final transcriptions
const SPEECH_BUFFER_SIZE_INTERIM = 10;    // Buffer size for interim transcriptions
const SPEECH_MAX_ADVANCE_LINES = 10;      // Max lines to advance from speech match
const SPEECH_LOOKAHEAD_LINES = 4;         // Lines ahead to search for matches

// TeleprompterManager class to handle teleprompter functionality
class TeleprompterManager {
  private text: string;
  private lineWidth: number;
  private numberOfLines: number;
  private scrollSpeed: number; // Words per minute
  private scrollInterval: number; // Milliseconds between updates
  private transcript: TranscriptProcessor;
  private lines: string[] = []; // All lines of text
  private currentLinePosition: number = 0;
  private linePositionAccumulator: number = 0; // For fractional line advances
  private avgWordsPerLine: number = 0;
  private wordsPerInterval: number = 0; // How many words to advance per interval
  private startTime: number = Date.now(); // Track when teleprompter started for stopwatch
  private endTimestamp: number | null = null; // Track when we reach the end of text
  private showingEndMessage: boolean = false; // Track if we're showing the END OF TEXT message
  private showingFinalLine: boolean = false; // Track if we're showing the final line
  private finalLineTimestamp: number | null = null; // Track when we started showing the final line
  private autoReplay: boolean = false; // Track if auto-replay is enabled
  private replayTimeout: NodeJS.Timeout | null = null; // Track the replay timeout
  private showEstimatedTotal: boolean = true; // Track if estimated total should be shown in status bar

  // Speech-based scrolling properties
  private speechBuffer: string[] = []; // Buffer of recent speech words
  private speechScrollEnabled: boolean = true; // Enable/disable speech-based scrolling
  private lastSpeechPosition: number = -1; // Last detected position from speech
  private speechLookaheadLines: number = SPEECH_LOOKAHEAD_LINES;
  private minWordsForMatch: number = 3; // Minimum words needed for a reliable match (reduced to 1)
  private lineOffset: number = 0; // Offset the line position by 1 to show the match on the 2nd line

  // Stage direction properties
  private stageDirectionDelimiter: DelimiterType = 'none'; // Which delimiter marks stage directions
  private stageDirectionDisplay: DisplayMode = 'dimmed'; // How to display stage directions
  private textForSpeechMatching: string = ''; // Text with stage directions stripped for speech matching
  private linesForSpeechMatching: string[] = []; // Lines with stage directions stripped

  // Debug logging
  private debugLogging: boolean = false; // Enable verbose debug logging

  constructor(text: string, lineWidth: number = DEFAULT_LINE_WIDTH, scrollSpeed: number = DEFAULT_SCROLL_SPEED_WPM, autoReplay: boolean = false, speechScrollEnabled: boolean = true, showEstimatedTotal: boolean = true) {
    this.text = text || this.getDefaultText();
    this.lineWidth = lineWidth;
    this.numberOfLines = DEFAULT_NUMBER_OF_LINES;
    this.scrollSpeed = scrollSpeed;
    this.scrollInterval = SCROLL_INTERVAL_MS;
    this.autoReplay = autoReplay;
    this.speechScrollEnabled = speechScrollEnabled;
    this.showEstimatedTotal = showEstimatedTotal;

    // Initialize transcript processor for text formatting
    this.transcript = new TranscriptProcessor(lineWidth, this.numberOfLines, this.numberOfLines * 2);

    // Process the text into lines
    this.processText();

    // Calculate words per interval based on WPM
    this.calculateWordsPerInterval();

    // Initialize start time
    this.resetStopwatch();
  }

  private processText(preservePosition: boolean = false): void {
    // Remember current position if preserving
    const oldPosition = this.currentLinePosition;
    const oldAccumulator = this.linePositionAccumulator;

    // Prepare text for display based on stage direction settings
    let textForDisplay: string;
    if (this.stageDirectionDisplay === 'hidden') {
      // For hidden mode, strip stage directions BEFORE wrapping so line widths are correct
      textForDisplay = stripStageDirections(this.text, this.stageDirectionDelimiter);
    } else {
      // For normal/dimmed modes, transform for display (dimmed converts delimiters to parentheses)
      textForDisplay = transformStageDirectionsForDisplay(
        this.text,
        this.stageDirectionDelimiter,
        this.stageDirectionDisplay
      );
    }

    // Split the display text into lines
    this.lines = this.transcript.wrapText(textForDisplay, this.lineWidth);

    // Prepare text for speech matching (always stripped of stage directions)
    this.textForSpeechMatching = stripStageDirections(this.text, this.stageDirectionDelimiter);
    this.linesForSpeechMatching = this.transcript.wrapText(this.textForSpeechMatching, this.lineWidth);

    if (!preservePosition) {
      this.currentLinePosition = 0;
      this.linePositionAccumulator = 0;
    } else {
      // Restore position but cap it if text is now shorter
      const maxPosition = Math.max(0, this.lines.length - this.numberOfLines);
      this.currentLinePosition = Math.min(oldPosition, maxPosition);
      this.linePositionAccumulator = oldAccumulator;
    }

    // Calculate average words per line (use speech matching text for accurate WPM)
    this.avgWordsPerLine = this.transcript.estimateWordsPerLine(this.textForSpeechMatching);
    if (this.avgWordsPerLine <= 0) this.avgWordsPerLine = 5; // Fallback to prevent division by zero

    console.log(`Average words per line: ${this.avgWordsPerLine}`);
  }

  private calculateWordsPerInterval(): void {
    // Calculate words per interval based on WPM and interval
    // WPM / (60 seconds per minute / interval in seconds)
    this.wordsPerInterval = (this.scrollSpeed / 60) * (this.scrollInterval / 1000);

    // Convert words per interval to lines per interval
    const linesPerInterval = this.wordsPerInterval / Math.max(1, this.avgWordsPerLine);

    console.log(`Scroll speed: ${this.scrollSpeed} WPM`);
    console.log(`Words per interval (${this.scrollInterval}ms): ${this.wordsPerInterval.toFixed(4)}`);
    console.log(`Estimated lines per interval: ${linesPerInterval.toFixed(4)}`);
  }

  // Reset the stopwatch
  private resetStopwatch(): void {
    this.startTime = Date.now();
  }

  // Get elapsed time as formatted string (MM:SS)
  private getElapsedTime(): string {
    const elapsedMs = Date.now() - this.startTime;
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Calculate and format the projected total time based on current progress
   * @param progressPercent Current progress as a percentage (0-100)
   * @returns Formatted time string (MM:SS) or "--:--" if projection not available
   */
  private getProjectedTotalTime(progressPercent: number): string {
    // Don't calculate projection if progress is too low (less than 5%) or at 100%
    if (progressPercent < 5 || progressPercent >= 100) {
      return "--:--";
    }

    const elapsedMs = Date.now() - this.startTime;
    const elapsedSeconds = elapsedMs / 1000;

    // Calculate projected total time: elapsed_time / (progress_percent / 100)
    const projectedTotalSeconds = Math.round(elapsedSeconds / (progressPercent / 100));

    const minutes = Math.floor(projectedTotalSeconds / 60);
    const seconds = projectedTotalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Get current time formatted as HH:MM:SS
  private getCurrentTime(): string {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  getDefaultText(): string {
    return `Welcome to AugmentOS Teleprompter. This is a default text that will scroll at your set speed. You can replace this with your own content through the settings. The teleprompter will automatically scroll text at a comfortable reading pace. You can adjust the scroll speed (in words per minute), line width, and number of lines through the settings menu. As you read this text, it will continue to scroll upward, allowing you to deliver your presentation smoothly and professionally. You can also use the teleprompter to read your own text. Just enter your text in the settings and the teleprompter will display it for you to read. When you reach the end of the text, the teleprompter will show "END OF TEXT" and then restart from the beginning after a short pause.`;
  }

  setText(newText: string): void {
    this.text = newText || this.getDefaultText();
    this.processText(false); // Reset position when text changes
    this.calculateWordsPerInterval();
  }

  setScrollSpeed(wordsPerMinute: number): void {
    // Ensure scroll speed is within reasonable bounds
    if (wordsPerMinute < MIN_SCROLL_SPEED_WPM) wordsPerMinute = MIN_SCROLL_SPEED_WPM;
    if (wordsPerMinute > MAX_SCROLL_SPEED_WPM) wordsPerMinute = MAX_SCROLL_SPEED_WPM;

    this.scrollSpeed = wordsPerMinute;
    this.calculateWordsPerInterval();

    console.log(`Scroll speed set to ${this.scrollSpeed} WPM`);
  }

  setLineWidth(width: number): void {
    this.lineWidth = width;
    this.transcript = new TranscriptProcessor(width, this.numberOfLines, this.numberOfLines * 2);
    this.processText(true); // Preserve position when line width changes
    this.calculateWordsPerInterval();
  }

  setNumberOfLines(lines: number): void {
    this.numberOfLines = lines;
    this.transcript = new TranscriptProcessor(this.lineWidth, lines, lines * 2);
    this.processText(true); // Preserve position when number of lines changes
  }

  setScrollInterval(intervalMs: number): void {
    // Ensure interval is within reasonable bounds
    if (intervalMs < 100) intervalMs = 100; // Minimum 100ms for performance
    if (intervalMs > 2000) intervalMs = 2000; // Maximum 2 seconds for responsiveness

    this.scrollInterval = intervalMs;
    this.calculateWordsPerInterval();
  }

  getScrollInterval(): number {
    return this.scrollInterval;
  }

  setAutoReplay(enabled: boolean): void {
    this.autoReplay = enabled;
    // If auto-replay is disabled, clear any pending replay timeout
    if (!enabled && this.replayTimeout) {
      clearTimeout(this.replayTimeout);
      this.replayTimeout = null;
    }
  }

  getAutoReplay(): boolean {
    return this.autoReplay;
  }

  /**
   * Set whether to show estimated total time in status bar
   */
  setShowEstimatedTotal(enabled: boolean): void {
    this.showEstimatedTotal = enabled;
  }

  /**
   * Get whether estimated total time is shown in status bar
   */
  getShowEstimatedTotal(): boolean {
    return this.showEstimatedTotal;
  }

  private scheduleReplay(): void {
    if (this.autoReplay && !this.replayTimeout) {
      this.replayTimeout = setTimeout(() => {
        this.resetPosition();
        this.replayTimeout = null;
      }, AUTO_REPLAY_DELAY_MS);
    }
  }

  resetPosition(): void {
    this.currentLinePosition = 0;
    this.linePositionAccumulator = 0;
    this.endTimestamp = null;
    this.showingEndMessage = false;
    this.showingFinalLine = false;
    this.finalLineTimestamp = null;
    if (this.replayTimeout) {
      clearTimeout(this.replayTimeout);
      this.replayTimeout = null;
    }
    this.clearSpeechBuffer(); // Clear speech buffer when position is reset
    this.resetStopwatch(); // Reset the stopwatch when position is reset
  }

  // Advance position based on words per minute
  advancePosition(): void {
    if (this.lines.length === 0) return;

    // Calculate how many lines to advance based on WPM
    // Convert words per interval to lines per interval
    const linesPerInterval = this.wordsPerInterval / Math.max(1, this.avgWordsPerLine);

    // Add to the accumulator
    this.linePositionAccumulator += linesPerInterval;

    // If we've accumulated enough for at least one line, advance
    if (this.linePositionAccumulator >= 1) {
      // Get integer number of lines to advance
      const linesToAdvance = Math.floor(this.linePositionAccumulator);
      // Keep the fractional part for next time
      this.linePositionAccumulator -= linesToAdvance;

      // Advance by calculated lines
      this.currentLinePosition += linesToAdvance;

      // Skip over empty lines after advancing
      this.currentLinePosition = this.skipEmptyLines(this.currentLinePosition);
    }

    // Cap at the end of text (when last line is at bottom of display)
    const maxPosition = this.lines.length - this.numberOfLines;
    if (this.currentLinePosition >= maxPosition) {
      this.currentLinePosition = maxPosition;
    }
  }

  // Get current visible text
  getCurrentVisibleText(): string {
    if (this.lines.length === 0) return "No text available";

    // Get visible lines
    const visibleLines = this.lines.slice(
      this.currentLinePosition,
      this.currentLinePosition + this.numberOfLines
    );

    // Add padding if needed
    while (visibleLines.length < this.numberOfLines) {
      visibleLines.push("");
    }

    // Add progress indicator with stopwatch and current time
    let progressPercent: number;
    if (this.lines.length <= this.numberOfLines) {
      progressPercent = 100;
    } else {
      progressPercent = Math.min(100, Math.round((this.currentLinePosition / (this.lines.length - this.numberOfLines)) * 100));
    }
    const elapsedTime = this.getElapsedTime();
    const projectedTotalTime = this.getProjectedTotalTime(progressPercent);
    const currentTime = this.getCurrentTime();
    const progressText = this.showEstimatedTotal
      ? `[${progressPercent}%] | ${elapsedTime} | Est Total: ${projectedTotalTime}`
      : `[${progressPercent}%] | ${elapsedTime}`;

    // Check if we're at the end
    if (this.isAtEnd()) {
      // If we haven't started showing the final line yet, start now
      if (!this.showingFinalLine && !this.showingEndMessage) {
        this.showingFinalLine = true;
        this.finalLineTimestamp = Date.now();
        return `${progressText}\n${visibleLines.join('\n')}`;
      }

      // If we're showing the final line, check if it's been 5 seconds
      if (this.showingFinalLine && this.finalLineTimestamp) {
        const timeAtFinalLine = Date.now() - this.finalLineTimestamp;
        if (timeAtFinalLine < FINAL_LINE_DISPLAY_MS) {
          return `${progressText}\n${visibleLines.join('\n')}`;
        } else {
          // After 5 seconds, switch to showing END OF TEXT
          this.showingFinalLine = false;
          this.showingEndMessage = true;
          this.endTimestamp = Date.now();
        }
      }

      // If we're showing the end message, check if time has elapsed
      if (this.showingEndMessage && this.endTimestamp) {
        const timeAtEnd = Date.now() - this.endTimestamp;
        if (timeAtEnd < END_MESSAGE_DISPLAY_MS) {
          return `${progressText}\n\n*** END OF TEXT ***`;
        } else {
          // After display time, just reset the flags
          // The actual restart will be handled by the scrolling logic
          this.showingEndMessage = false;
          this.endTimestamp = null;
          this.finalLineTimestamp = null;
          this.showingFinalLine = false;
        }
      }
    }

    return `${progressText}\n${visibleLines.join('\n')}`;
  }

  isAtEnd(): boolean {
    // Consider at end when last line is at bottom of display
    const isEnd = this.currentLinePosition >= this.lines.length - this.numberOfLines;
    if (isEnd && this.endTimestamp === null && !this.showingFinalLine && !this.showingEndMessage) {
      console.log('Reached end of text, starting final line display');
    }
    return isEnd;
  }

  // Get total number of lines for debugging
  getTotalLines(): number {
    return this.lines.length;
  }

  // Get current line position for debugging
  getCurrentLinePosition(): number {
    return this.currentLinePosition;
  }

  clear(): void {
    this.transcript.clear();
  }

  // Get scroll speed in WPM
  getScrollSpeed(): number {
    return this.scrollSpeed;
  }

  isShowingEndMessage(): boolean {
    return this.showingEndMessage;
  }

  getText(): string {
    return this.text;
  }

    /**
   * Process incoming speech transcription and update position accordingly
   * @param speechText - The latest speech text from transcription
   * @param isFinal - Whether this is a final transcription result
   */
  processSpeechInput(speechText: string, isFinal: boolean = false): void {
    if (!this.speechScrollEnabled || !speechText.trim()) {
      return;
    }

    // Clean and split the speech text into words - use same normalization as search text
    const words = speechText.toLowerCase()
      .replace(/[^\w\s'-]/g, ' ') // Keep apostrophes and hyphens, like search text
      .split(/\s+/)
      .filter(word => word.length > 0);

    if (words.length === 0) {
      return;
    }

    // Update speech buffer with appropriate size based on result type
    if (isFinal) {
      // For final results, keep more context in the buffer
      this.speechBuffer = [...this.speechBuffer, ...words].slice(-SPEECH_BUFFER_SIZE_FINAL);
    } else {
      // For interim results, use a smaller buffer for more responsive matching
      this.speechBuffer = [...this.speechBuffer, ...words].slice(-SPEECH_BUFFER_SIZE_INTERIM);
    }

    this.debugLog(`[SPEECH DEBUG] Buffer (${this.speechBuffer.length} words): "${this.speechBuffer.join(' ')}" | Current line: ${this.currentLinePosition}`);

    // Only try to match if we have enough words
    if (this.speechBuffer.length < this.minWordsForMatch) {
      return;
    }

    // Find the best match position in the text
    const matchPosition = this.findSpeechMatchPosition();

    if (matchPosition !== -1) {
      this.debugLog(`[SPEECH MATCH] Found at line ${matchPosition}, current position: ${this.currentLinePosition}`);

      // Only advance forward - never go backward
      if (matchPosition > this.currentLinePosition) {
        // Calculate how far to advance - be more aggressive but only forward
        const maxAdvance = Math.min(matchPosition, this.currentLinePosition + SPEECH_MAX_ADVANCE_LINES);

        // Add slight forward bias to help keep up with speech
        const biasedPosition = Math.max(maxAdvance, this.currentLinePosition);

        // Position the teleprompter so the matched text appears on the 2nd line (not 1st)
        // This provides better spatial reference for tracking location
        const targetPosition = Math.max(this.currentLinePosition, biasedPosition - this.lineOffset); // Never go below current position

        // Skip over empty lines when advancing
        const finalPosition = this.skipEmptyLines(targetPosition);

        const previousPosition = this.currentLinePosition;
        // Ensure we only move forward, never backward
        this.currentLinePosition = Math.max(this.currentLinePosition, Math.min(finalPosition, this.lines.length - this.numberOfLines));

        if (this.currentLinePosition !== previousPosition) {
          this.linePositionAccumulator = 0; // Reset accumulator since we're jumping
        }
        this.lastSpeechPosition = matchPosition;

        this.debugLog(`[SPEECH ADVANCE] Moved forward to line ${this.currentLinePosition} (was ${previousPosition}) to show speech match at line ${matchPosition} on 2nd display line`);
      } else {
        this.debugLog(`[SPEECH NO_ADVANCE] Match at line ${matchPosition} is not ahead of current position ${this.currentLinePosition}, staying put`);
      }
    } else {
      this.debugLog(`[SPEECH NO_MATCH] No match found for buffer: "${this.speechBuffer.slice(-5).join(' ')}" | Searching from line ${this.currentLinePosition}`);
    }
  }

    /**
   * Find the best match position for current speech buffer in the teleprompter text
   * Uses linesForSpeechMatching which has stage directions stripped.
   * @returns Line number where speech was found, or -1 if no good match
   */
  private findSpeechMatchPosition(): number {
    // Use speech matching lines (stage directions stripped)
    const linesToSearch = this.linesForSpeechMatching.length > 0
      ? this.linesForSpeechMatching
      : this.lines;

    if (this.speechBuffer.length < this.minWordsForMatch || linesToSearch.length === 0) {
      return -1;
    }

        // Search window - only look forward, never backward
    const searchStartLine = this.currentLinePosition; // Start from current position, never behind
    const searchEndLine = Math.min(
      linesToSearch.length,
      this.currentLinePosition + this.numberOfLines + 1 // Much larger lookahead
    );

    this.debugLog(`[SEARCH DEBUG] Searching lines ${searchStartLine} to ${searchEndLine} (current: ${this.currentLinePosition})`);

    const searchLines = linesToSearch.slice(searchStartLine, searchEndLine);
    // Filter out empty lines from search text
    const nonEmptyLines = searchLines.filter(line => line && line.trim().length > 0);

    // Better text normalization
    const searchText = nonEmptyLines.join(' ').toLowerCase()
      .replace(/[^\w\s'-]/g, ' ') // Keep apostrophes and hyphens
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    if (!searchText) {
      this.debugLog(`[SEARCH DEBUG] No search text found in range`);
      return -1;
    }

    const searchWords = searchText.split(' ').filter(w => w.length > 0);
    this.debugLog(`[SEARCH DEBUG] Search text (${searchWords.length} words): "${searchText.substring(0, 100)}..."`);

    // Try different speech buffer lengths (from shorter to longer for better responsiveness)
    for (let bufferLen = Math.min(this.speechBuffer.length, 5); bufferLen >= this.minWordsForMatch; bufferLen--) {
      const speechPhrase = this.speechBuffer.slice(-bufferLen).join(' ');
      this.debugLog(`[MATCH DEBUG] Trying phrase (${bufferLen} words): "${speechPhrase}"`);

      // Try exact match first
      const exactMatch = this.findExactMatch(speechPhrase, searchWords, searchStartLine);
      if (exactMatch !== -1) {
        this.debugLog(`[MATCH SUCCESS] Exact match found: "${speechPhrase}" at line ${exactMatch}`);
        return exactMatch;
      }

      // Try fuzzy match next
      const fuzzyMatch = this.findFuzzyMatch(speechPhrase, searchWords, searchStartLine);
      if (fuzzyMatch !== -1) {
        this.debugLog(`[MATCH SUCCESS] Fuzzy match found: "${speechPhrase}" at line ${fuzzyMatch}`);
        return fuzzyMatch;
      }
    }

    return -1;
  }

  /**
   * Find exact match of speech phrase in search text
   */
  private findExactMatch(speechPhrase: string, searchWords: string[], searchStartLine: number): number {
    const searchText = searchWords.join(' ');
    const matchIndex = searchText.indexOf(speechPhrase);

    if (matchIndex !== -1) {
      // Convert character position back to line number
      const wordsBeforeMatch = searchText.substring(0, matchIndex).split(' ').length - 1;
      const linePosition = this.estimateLineFromWordPosition(wordsBeforeMatch, searchStartLine);
      return linePosition;
    }

    return -1;
  }

  /**
   * Find fuzzy match allowing for some word differences
   */
  private findFuzzyMatch(speechPhrase: string, searchWords: string[], searchStartLine: number): number {
    const speechWords = speechPhrase.split(' ');
    const minMatchWords = Math.max(this.minWordsForMatch, speechWords.length); // Very aggressive - require only 30% word match

    // Try multiple sliding window sizes to handle speech recognition variability
    const windowSizes = [speechWords.length, speechWords.length + 1, speechWords.length - 1].filter(s => s > 0);

    for (const windowSize of windowSizes) {
      for (let i = 0; i <= searchWords.length - windowSize; i++) {
        const windowWords = searchWords.slice(i, i + windowSize);
        let matchCount = 0;

        // More flexible matching - allow words to be out of order within a small range
        for (const speechWord of speechWords) {
          for (let j = 0; j < windowWords.length; j++) {
            if (this.wordsAreSimilar(speechWord, windowWords[j])) {
              matchCount++;
              break; // Found a match, move to next speech word
            }
          }
        }

        if (matchCount >= minMatchWords) {
          const linePosition = this.estimateLineFromWordPosition(i, searchStartLine);
          this.debugLog(`[FUZZY SUCCESS] Match of ${matchCount} words at word position ${i}, estimated line ${linePosition} for phrase "${speechPhrase}"`);
          return linePosition;
        }
      }
    }

    return -1;
  }

    /**
   * Check if two words are similar (handles common speech recognition errors)
   */
  private wordsAreSimilar(word1: string, word2: string): boolean {
    if (word1 === word2) return true;
    if (word1.length < 2 || word2.length < 2) return word1 === word2; // More lenient for short words

    // Check if one word starts with the other (common with speech recognition)
    if (word1.startsWith(word2) || word2.startsWith(word1)) {
      return true;
    }

    // Check if one word contains the other (more aggressive matching)
    if (word1.includes(word2) || word2.includes(word1)) {
      return true;
    }

    // More lenient edit distance for words
    if (word1.length <= 7 && word2.length <= 7) {
      const maxDistance = Math.max(1, Math.floor(Math.min(word1.length, word2.length) * 0.3)); // Allow 30% character difference
      return this.calculateLevenshteinDistance(word1, word2, maxDistance) <= maxDistance;
    }

    return false;
  }

  /**
   * Calculate Levenshtein distance between two strings with early exit optimization.
   * Uses two-row optimization to reduce memory from O(n*m) to O(min(n,m)).
   * @param str1 First string
   * @param str2 Second string
   * @param maxDistance Optional maximum distance - returns early if exceeded
   */
  private calculateLevenshteinDistance(str1: string, str2: string, maxDistance?: number): number {
    // Ensure str1 is the shorter string for memory optimization
    if (str1.length > str2.length) {
      [str1, str2] = [str2, str1];
    }

    const len1 = str1.length;
    const len2 = str2.length;

    // Quick exit for length difference exceeding max distance
    if (maxDistance !== undefined && Math.abs(len1 - len2) > maxDistance) {
      return maxDistance + 1;
    }

    // Use two rows instead of full matrix - O(min(n,m)) memory instead of O(n*m)
    let prevRow = Array(len1 + 1).fill(0).map((_, i) => i);
    let currRow = Array(len1 + 1).fill(0);

    for (let j = 1; j <= len2; j++) {
      currRow[0] = j;
      let rowMin = currRow[0]; // Track minimum in current row for early exit

      for (let i = 1; i <= len1; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        currRow[i] = Math.min(
          currRow[i - 1] + 1,      // deletion
          prevRow[i] + 1,          // insertion
          prevRow[i - 1] + cost    // substitution
        );
        rowMin = Math.min(rowMin, currRow[i]);
      }

      // Early exit if minimum possible distance exceeds threshold
      if (maxDistance !== undefined && rowMin > maxDistance) {
        return maxDistance + 1;
      }

      // Swap rows
      [prevRow, currRow] = [currRow, prevRow];
    }

    return prevRow[len1];
  }

    /**
   * Estimate line number from word position in search area.
   * Uses linesForSpeechMatching for consistent position mapping.
   */
  private estimateLineFromWordPosition(wordPosition: number, searchStartLine: number): number {
    if (this.avgWordsPerLine <= 0) return searchStartLine;

    // Use speech matching lines for position estimation
    const linesToUse = this.linesForSpeechMatching.length > 0
      ? this.linesForSpeechMatching
      : this.lines;

    // More accurate line estimation by counting actual words in lines
    let wordCount = 0;
    for (let lineIdx = searchStartLine; lineIdx < linesToUse.length; lineIdx++) {
      const line = linesToUse[lineIdx];
      const lineWords = line ? line.toLowerCase()
        .replace(/[^\w\s'-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 0).length : 0;

      if (wordCount + lineWords > wordPosition) {
        this.debugLog(`[POSITION DEBUG] Word position ${wordPosition} maps to line ${lineIdx} (accumulated ${wordCount} words)`);
        return lineIdx;
      }

      wordCount += lineWords;
    }

    // Fallback to original calculation
    const estimatedLinesFromStart = Math.floor(wordPosition / this.avgWordsPerLine);
    const result = Math.max(0, searchStartLine + estimatedLinesFromStart);
    this.debugLog(`[POSITION DEBUG] Fallback estimation: word ${wordPosition} -> line ${result}`);
    return result;
  }

  /**
   * Enable or disable speech-based scrolling
   */
  setSpeechScrollEnabled(enabled: boolean): void {
    this.speechScrollEnabled = enabled;
    if (!enabled) {
      this.speechBuffer = [];
      this.lastSpeechPosition = -1;
    }
  }

  /**
   * Get current speech scroll status
   */
  isSpeechScrollEnabled(): boolean {
    return this.speechScrollEnabled;
  }

  /**
   * Clear speech buffer (useful when resetting or changing text)
   */
  clearSpeechBuffer(): void {
    this.speechBuffer = [];
    this.lastSpeechPosition = -1;
  }

  /**
   * Get the current scrolling mode
   */
  getScrollingMode(): string {
    return this.speechScrollEnabled ? 'SPEECH-BASED' : 'TIME-BASED';
  }

  /**
   * Set the stage direction delimiter type.
   * When changed, reprocesses text to apply new filtering.
   */
  setStageDirectionDelimiter(delimiter: DelimiterType): void {
    if (this.stageDirectionDelimiter !== delimiter) {
      this.stageDirectionDelimiter = delimiter;
      this.processText(true); // Preserve position
    }
  }

  /**
   * Get the current stage direction delimiter
   */
  getStageDirectionDelimiter(): DelimiterType {
    return this.stageDirectionDelimiter;
  }

  /**
   * Set the stage direction display mode.
   * When changed, reprocesses text to apply new display transformation.
   */
  setStageDirectionDisplay(displayMode: DisplayMode): void {
    if (this.stageDirectionDisplay !== displayMode) {
      this.stageDirectionDisplay = displayMode;
      this.processText(true); // Preserve position
    }
  }

  /**
   * Get the current stage direction display mode
   */
  getStageDirectionDisplay(): DisplayMode {
    return this.stageDirectionDisplay;
  }

  /**
   * Set whether debug logging is enabled
   */
  setDebugLogging(enabled: boolean): void {
    this.debugLogging = enabled;
  }

  /**
   * Log a debug message if debug logging is enabled
   */
  private debugLog(message: string): void {
    if (this.debugLogging) {
      console.log(message);
    }
  }

  /**
   * Skip over empty lines starting from the given position
   * @param startPosition - Position to start checking from
   * @returns Position after skipping empty lines
   */
  private skipEmptyLines(startPosition: number): number {
    let position = startPosition;
    const maxPosition = this.lines.length - this.numberOfLines;

    // Skip empty lines that would be visible in the current view
    while (position <= maxPosition) {
      let hasContent = false;

      // Check if any of the visible lines have content
      for (let i = 0; i < this.numberOfLines && position + i < this.lines.length; i++) {
        const line = this.lines[position + i];
        if (line && line.trim().length > 0) {
          hasContent = true;
          break;
        }
      }

      if (hasContent) {
        break; // Found content, stop skipping
      }

      position++; // Skip this empty view
    }

    return Math.min(position, maxPosition);
  }

  /**
   * Check if current visible window has speakable content.
   * When speech scrolling is enabled, if all visible lines are stage directions
   * (empty in linesForSpeechMatching), the teleprompter would stall.
   * This method checks for that condition.
   * @returns true if there is speakable content, false if all visible lines are stage directions only
   */
  hasVisibleSpeakableContent(): boolean {
    if (!this.speechScrollEnabled) {
      return true; // Not relevant for time-based scrolling
    }

    // Use speech matching lines to check for speakable content
    const linesToCheck = this.linesForSpeechMatching.length > 0
      ? this.linesForSpeechMatching
      : this.lines;

    // Check if any visible line has speakable content
    for (let i = 0; i < this.numberOfLines && this.currentLinePosition + i < linesToCheck.length; i++) {
      const line = linesToCheck[this.currentLinePosition + i];
      if (line && line.trim().length > 0) {
        return true; // Found speakable content
      }
    }

    return false; // All visible lines are stage directions only
  }

  /**
   * Auto-advance past stage direction-only content.
   * When speech scrolling is enabled and all visible lines are stage directions,
   * automatically advance to the next line with speakable content.
   * @returns true if position was advanced, false otherwise
   */
  autoAdvancePastStageDirections(): boolean {
    if (!this.speechScrollEnabled) {
      return false; // Only applies to speech-based scrolling
    }

    if (this.hasVisibleSpeakableContent()) {
      return false; // Has speakable content, no need to advance
    }

    // Use speech matching lines to find next speakable content
    const linesToCheck = this.linesForSpeechMatching.length > 0
      ? this.linesForSpeechMatching
      : this.lines;

    const maxPosition = Math.max(0, this.lines.length - this.numberOfLines);

    // Find next position with speakable content
    let nextPosition = this.currentLinePosition + 1;
    while (nextPosition <= maxPosition) {
      // Check if this position has any speakable content in the visible window
      let hasSpeakable = false;
      for (let i = 0; i < this.numberOfLines && nextPosition + i < linesToCheck.length; i++) {
        const line = linesToCheck[nextPosition + i];
        if (line && line.trim().length > 0) {
          hasSpeakable = true;
          break;
        }
      }

      if (hasSpeakable) {
        this.debugLog(`[AUTO-ADVANCE] Advancing from line ${this.currentLinePosition} to ${nextPosition} (skipping stage direction-only content)`);
        this.currentLinePosition = nextPosition;
        this.linePositionAccumulator = 0;
        return true;
      }

      nextPosition++;
    }

    // Reached end of text with no more speakable content
    this.debugLog(`[AUTO-ADVANCE] Reached end of speakable content at line ${this.currentLinePosition}`);
    return false;
  }
}

/**
 * Tracks all timers and cleanup functions for a session to prevent orphaned
 * timers, event handlers, and race conditions
 */
interface SessionTimers {
  initialDisplay?: NodeJS.Timeout;  // 1-second initial display timeout
  scrollDelay?: NodeJS.Timeout;     // 5-second delay before scrolling starts
  scrollInterval?: NodeJS.Timeout;  // Main scroll interval
  endInterval?: NodeJS.Timeout;     // End-of-text display interval
  restartDelay?: NodeJS.Timeout;    // Auto-replay restart delay
  transcriptionUnsubscribe?: () => void;  // Function to unsubscribe from transcription events
}

/**
 * TeleprompterApp - Main application class for the Teleprompter
 * that extends TpaServer for seamless integration with AugmentOS
 */
class TeleprompterApp extends TpaServer {
  // Maps to track user teleprompter managers and active session timers
  private userTeleprompterManagers = new Map<string, TeleprompterManager>();
  private sessionTimers = new Map<string, SessionTimers>();
  private userSessions = new Map<string, Set<string>>(); // userId -> Set of sessionIds

  constructor() {
    if (!MENTRAOS_API_KEY) {
      throw new Error('MENTRAOS_API_KEY is not set');
    }

    super({
      packageName: PACKAGE_NAME!,
      apiKey: MENTRAOS_API_KEY as string,
      port: PORT,
      publicDir: path.join(__dirname, './public')
    });
  }

  /**
   * Called by TpaServer when a new session is created
   */
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`\n\n📜📜📜 Received teleprompter session request for user ${userId}, session ${sessionId}\n\n`);

    // Track this session for the user
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(sessionId);

    try {
      // Set up settings change handlers
      this.setupSettingsHandlers(session, sessionId, userId);

      // Apply initial settings
      await this.applySettings(session, sessionId, userId);

      // Start scrolling (this registers the session and shows initial text)
      this.startScrolling(session, sessionId, userId);

    } catch (error) {
      console.error('Error initializing session:', error);
      // Create default teleprompter manager if there was an error
      const teleprompterManager = new TeleprompterManager('', DEFAULT_LINE_WIDTH, DEFAULT_SCROLL_SPEED_WPM);
      this.userTeleprompterManagers.set(userId, teleprompterManager);

      // Start scrolling (this registers the session and shows initial text)
      this.startScrolling(session, sessionId, userId);
    }
  }

  /**
   * Set up handlers for settings changes
   */
  private setupSettingsHandlers(
    session: TpaSession,
    sessionId: string,
    userId: string
  ): void {
    // Handle line width changes
    session.settings.onValueChange('line_width', (newValue, oldValue) => {
      console.log(`Line width changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });

    // Handle scroll speed changes
    session.settings.onValueChange('scroll_speed', (newValue, oldValue) => {
      console.log(`Scroll speed changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });

    // Handle number of lines changes
    session.settings.onValueChange('number_of_lines', (newValue, oldValue) => {
      console.log(`Number of lines changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });

    // Handle custom text changes
    session.settings.onValueChange('custom_text', (newValue, oldValue) => {
      console.log(`Custom text changed for user ${userId}`);
      this.applySettings(session, sessionId, userId);
      this.stopScrolling(sessionId);
      this.startScrolling(session, sessionId, userId);
    });

    session.settings.onValueChange('auto_replay', (newValue, oldValue) => {
      console.log(`Auto replay changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });

    // Handle speech scroll enabled changes
    session.settings.onValueChange('speech_scroll_enabled', (newValue, oldValue) => {
      console.log(`Speech scroll enabled changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });

    // Handle show estimated total changes
    session.settings.onValueChange('show_estimated_total', (newValue, oldValue) => {
      console.log(`Show estimated total changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });

    // Handle stage direction delimiter changes
    session.settings.onValueChange('stage_direction_delimiter', (newValue, oldValue) => {
      console.log(`Stage direction delimiter changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });

    // Handle stage direction display mode changes
    session.settings.onValueChange('stage_direction_display', (newValue, oldValue) => {
      console.log(`Stage direction display changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });

    // Handle debug logging changes
    session.settings.onValueChange('debug_logging', (newValue, oldValue) => {
      console.log(`Debug logging changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });
  }

  /**
   * Apply settings from the session to the teleprompter manager
   */
  private async applySettings(
    session: TpaSession,
    sessionId: string,
    userId: string
  ): Promise<void> {
    try {
      // Extract settings from the session
      const lineWidthString = session.settings.get<string>('line_width', "Medium");
      const scrollSpeed = session.settings.get<number>('scroll_speed', DEFAULT_SCROLL_SPEED_WPM);
      const numberOfLines = parseInt(session.settings.get<string>('number_of_lines', String(DEFAULT_NUMBER_OF_LINES)));
      const customText = session.settings.get<string>('custom_text', '');
      const autoReplay = session.settings.get<boolean>('auto_replay', false);
      const speechScrollEnabled = session.settings.get<boolean>('speech_scroll_enabled', true);
      const showEstimatedTotal = session.settings.get<boolean>('show_estimated_total', true);
      const stageDirectionDelimiter = session.settings.get<string>('stage_direction_delimiter', 'none') as DelimiterType;
      const stageDirectionDisplay = session.settings.get<string>('stage_direction_display', 'dimmed') as DisplayMode;
      const debugLogging = session.settings.get<boolean>('debug_logging', false);

      const lineWidth = convertLineWidth(lineWidthString, false);

      console.log(`Applied settings for user ${userId}: lineWidth=${lineWidth}, scrollSpeed=${scrollSpeed}, numberOfLines=${numberOfLines}, autoReplay=${autoReplay}, speechScrollEnabled=${speechScrollEnabled}, showEstimatedTotal=${showEstimatedTotal}, stageDirectionDelimiter=${stageDirectionDelimiter}, stageDirectionDisplay=${stageDirectionDisplay}`);

      // Create or update teleprompter manager
      let teleprompterManager = this.userTeleprompterManagers.get(userId);
      let textChanged = false;
      // Always ensure newTextToSet is a string
      const newTextToSet = (customText ?? '') || teleprompterManager?.getDefaultText() || '';
      console.log(`Applying settings for user ${userId}: customText=${customText}`);
      if (!teleprompterManager) {
        teleprompterManager = new TeleprompterManager(newTextToSet, lineWidth, scrollSpeed, autoReplay, speechScrollEnabled, showEstimatedTotal);
        teleprompterManager.setNumberOfLines(numberOfLines);
        teleprompterManager.setStageDirectionDelimiter(stageDirectionDelimiter);
        teleprompterManager.setStageDirectionDisplay(stageDirectionDisplay);
        teleprompterManager.setDebugLogging(debugLogging);
        this.userTeleprompterManagers.set(userId, teleprompterManager);
        textChanged = true; // Always reset on first creation
      } else {
        // Check if text changed (compare actual text that will be displayed)
        if (teleprompterManager.getText() !== newTextToSet) {
          teleprompterManager.setText(newTextToSet);
          textChanged = true;
        }
        teleprompterManager.setLineWidth(lineWidth);
        teleprompterManager.setScrollSpeed(scrollSpeed);
        teleprompterManager.setNumberOfLines(numberOfLines);
        teleprompterManager.setAutoReplay(autoReplay);
        teleprompterManager.setSpeechScrollEnabled(speechScrollEnabled);
        teleprompterManager.setShowEstimatedTotal(showEstimatedTotal);
        teleprompterManager.setStageDirectionDelimiter(stageDirectionDelimiter);
        teleprompterManager.setStageDirectionDisplay(stageDirectionDisplay);
        teleprompterManager.setDebugLogging(debugLogging);
      }

      console.log(`Text changed: ${textChanged}`);
      // Only reset position if the text changed
      if (textChanged) {
        teleprompterManager.resetPosition();
      }

    } catch (error) {
      console.error(`Error applying settings for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Called by TpaServer when a session is stopped
   */
  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    console.log(`Session ${sessionId} stopped: ${reason}`);

    // Stop all timers for this session (this also removes from sessionTimers map)
    this.stopScrolling(sessionId);

    // Remove this session from user's session set
    const userSessionSet = this.userSessions.get(userId);
    if (userSessionSet) {
      userSessionSet.delete(sessionId);

      // If no other sessions for this user, clean up the teleprompter manager
      if (userSessionSet.size === 0) {
        this.userSessions.delete(userId);
        try {
          const teleprompterManager = this.userTeleprompterManagers.get(userId);
          if (teleprompterManager) {
            teleprompterManager.clear();
            teleprompterManager.resetPosition();
            this.userTeleprompterManagers.delete(userId);
            console.log(`[User ${userId}]: All sessions closed, teleprompter manager destroyed`);
          }
        } catch (e) {
          console.error('Error cleaning up session:', e);
        }
      }
    }
  }

  /**
   * Displays text to the user using the SDK's layout API
   */
  private showTextToUser(session: TpaSession, sessionId: string, text: string): void {
    // Check if the session is still active
    if (!this.isSessionActive(sessionId)) {
      console.log(`[Session ${sessionId}]: Session is no longer active, not sending text`);
      return;
    }

    // Check WebSocket state before sending
    try {
      const ws = (session as any).ws;
      if (ws && ws.readyState !== 1) { // 1 is OPEN state
        console.log(`[Session ${sessionId}]: WebSocket not in OPEN state (state: ${ws.readyState}), stopping text updates`);
        this.stopScrolling(sessionId);
        return;
      }

      console.log(`[Session ${sessionId}]: Displaying text wall (${text.length} chars)`);

      // Use the SDK's layout API to display the text
      session.layouts.showTextWall(text, {
        view: ViewType.MAIN,
        durationMs: DISPLAY_TIMEOUT_MS
      });
    } catch (error: any) {
      // Check if this is a WebSocket connection error
      if (error.message && error.message.includes('WebSocket not connected')) {
        console.log(`[Session ${sessionId}]: WebSocket connection closed, stopping text updates`);
        // Stop any active intervals for this session
        this.stopScrolling(sessionId);
      } else {
        console.error(`[Session ${sessionId}]: Failed to display text wall:`, error);
      }
    }
  }

  /**
   * Starts scrolling the teleprompter text for a session
   */
  private startScrolling(session: TpaSession, sessionId: string, userId: string): void {
    // Check if we already have timers for this session - clean up first
    if (this.sessionTimers.has(sessionId)) {
      this.stopScrolling(sessionId);
    }

    // Get teleprompter manager for this user
    const teleprompterManager = this.userTeleprompterManagers.get(userId);
    if (!teleprompterManager) {
      console.error(`No teleprompter manager found for user ${userId}, session ${sessionId}`);
      return;
    }

    // Check if the session is still active before creating intervals
    try {
      const _ = (session as any).layouts;
    } catch (error) {
      console.log(`[Session ${sessionId}]: Session is no longer active, not starting scrolling`);
      return;
    }

    // IMPORTANT: Register session IMMEDIATELY before any async operations
    // This ensures all subsequent checks pass
    const timers: SessionTimers = {};
    this.sessionTimers.set(sessionId, timers);
    console.log(`[Session ${sessionId}]: Session registered, starting teleprompter`);

    // Set up speech-based scrolling if enabled
    if (teleprompterManager.isSpeechScrollEnabled()) {
      try {
        console.log(`[Session ${sessionId}]: Setting up SPEECH-BASED scrolling for user ${userId}`);

        // Store unsubscribe function in session timers so it gets cleaned up with the session
        timers.transcriptionUnsubscribe = session.events.onTranscription((data) => {
          try {
            if (!this.isSessionActive(sessionId)) {
              return;
            }

            const speechText = data.text?.trim();
            if (speechText) {
              console.log(`[Session ${sessionId}]: Processing speech: "${speechText}" (final: ${data.isFinal})`);
              teleprompterManager.processSpeechInput(speechText, data.isFinal);
            }
          } catch (error) {
            console.error(`[Session ${sessionId}]: Error processing speech:`, error);
          }
        });

        console.log(`[Session ${sessionId}]: Speech transcription listener set up`);
      } catch (error) {
        console.error(`[Session ${sessionId}]: Failed to set up speech transcription:`, error);
      }
    } else {
      console.log(`[Session ${sessionId}]: Using TIME-BASED scrolling for user ${userId}`);
    }

    // Show initial text after 1 second delay
    timers.initialDisplay = setTimeout(() => {
      if (!this.isSessionActive(sessionId)) return;
      console.log(`[Session ${sessionId}]: Showing initial text`);
      this.showTextToUser(session, sessionId, teleprompterManager.getCurrentVisibleText());
    }, INITIAL_DISPLAY_DELAY_MS);

    // Start scrolling after delay
    timers.scrollDelay = setTimeout(() => {
      if (!this.isSessionActive(sessionId)) return;

      console.log(`[Session ${sessionId}]: Starting scroll interval`);

      // Create the main scroll interval
      timers.scrollInterval = setInterval(() => {
        try {
          if (!this.isSessionActive(sessionId)) {
            return;
          }

          // Advance position if time-based scrolling
          if (!teleprompterManager.isSpeechScrollEnabled()) {
            teleprompterManager.advancePosition();
          }

          // Display current text
          const textToDisplay = teleprompterManager.getCurrentVisibleText();
          this.showTextToUser(session, sessionId, textToDisplay);

          // Auto-advance if all visible lines are stage directions (speech scrolling only)
          // This prevents stalling when the user has spoken through content and
          // the remaining visible lines are all stage directions
          if (teleprompterManager.isSpeechScrollEnabled()) {
            teleprompterManager.autoAdvancePastStageDirections();
          }

          // Check if we've reached the end
          if (teleprompterManager.isAtEnd() && !timers.endInterval) {
            console.log(`[Session ${sessionId}]: Reached end of teleprompter text`);

            // Create end interval for showing end message
            timers.endInterval = setInterval(() => {
              try {
                if (!this.isSessionActive(sessionId)) {
                  return;
                }

                const endText = teleprompterManager.getCurrentVisibleText();
                this.showTextToUser(session, sessionId, endText);

                if (teleprompterManager.isShowingEndMessage()) {
                  if (teleprompterManager.getAutoReplay()) {
                    // Clear current timers and schedule restart
                    if (timers.endInterval) clearInterval(timers.endInterval);
                    if (timers.scrollInterval) clearInterval(timers.scrollInterval);
                    timers.endInterval = undefined;
                    timers.scrollInterval = undefined;

                    timers.restartDelay = setTimeout(() => {
                      if (!this.isSessionActive(sessionId)) return;
                      console.log(`[Session ${sessionId}]: Restarting teleprompter for auto-replay`);
                      teleprompterManager.resetPosition();
                      // Clean up and restart
                      this.sessionTimers.delete(sessionId);
                      this.startScrolling(session, sessionId, userId);
                    }, AUTO_REPLAY_DELAY_MS);
                  } else {
                    // Stop everything
                    this.stopScrolling(sessionId);
                    this.userTeleprompterManagers.delete(userId);
                    console.log(`[Session ${sessionId}]: Finished, cleaned up`);
                  }
                }
              } catch (error: any) {
                if (error.message?.includes('WebSocket not connected')) {
                  this.stopScrolling(sessionId);
                  this.userTeleprompterManagers.delete(userId);
                }
              }
            }, SCROLL_INTERVAL_MS);
          }
        } catch (error: any) {
          if (error.message?.includes('WebSocket not connected')) {
            console.log(`[Session ${sessionId}]: WebSocket closed, stopping`);
            this.stopScrolling(sessionId);
          }
        }
      }, teleprompterManager.getScrollInterval());
    }, SCROLL_START_DELAY_MS);
  }

  /**
   * Stops all timers for a session and cleans up event handlers
   */
  private stopScrolling(sessionId: string): void {
    const timers = this.sessionTimers.get(sessionId);
    if (timers) {
      // Clear all timers
      if (timers.initialDisplay) {
        clearTimeout(timers.initialDisplay);
      }
      if (timers.scrollDelay) {
        clearTimeout(timers.scrollDelay);
      }
      if (timers.scrollInterval) {
        clearInterval(timers.scrollInterval);
      }
      if (timers.endInterval) {
        clearInterval(timers.endInterval);
      }
      if (timers.restartDelay) {
        clearTimeout(timers.restartDelay);
      }
      // Unsubscribe from transcription events to prevent handler accumulation
      if (timers.transcriptionUnsubscribe) {
        timers.transcriptionUnsubscribe();
      }
      this.sessionTimers.delete(sessionId);
      console.log(`[Session ${sessionId}]: Stopped all timers and unsubscribed from events`);
    }
  }

  /**
   * Check if a session is active (has timers registered)
   */
  private isSessionActive(sessionId: string): boolean {
    return this.sessionTimers.has(sessionId);
  }
}

// Create and start the app
const teleprompterApp = new TeleprompterApp();

// Add health check endpoint
const expressApp = teleprompterApp.getExpressApp();
expressApp.get('/health', (req, res) => {
  res.json({ status: 'healthy', app: PACKAGE_NAME });
});

// Start the server
teleprompterApp.start().then(() => {
  console.log(`${PACKAGE_NAME} server running on port ${PORT}`);
}).catch(error => {
  console.error('Failed to start server:', error);
});

