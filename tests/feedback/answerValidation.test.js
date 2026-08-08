import { describe, it, expect } from 'vitest';
import { validateAnswerForQuestion } from '../../src/services/feedbackService.js';

describe('validateAnswerForQuestion', () => {
  describe('rating', () => {
    const question = { questionType: 'rating', options: [] };

    it('accepts an integer from 1 to 5', () => {
      expect(validateAnswerForQuestion(question, 1)).toBe(1);
      expect(validateAnswerForQuestion(question, 5)).toBe(5);
    });

    it('rejects a non-integer', () => {
      expect(() => validateAnswerForQuestion(question, 4.5)).toThrow();
    });

    it('rejects a value below 1 or above 5', () => {
      expect(() => validateAnswerForQuestion(question, 0)).toThrow();
      expect(() => validateAnswerForQuestion(question, 6)).toThrow();
    });

    it('rejects a non-numeric value', () => {
      expect(() => validateAnswerForQuestion(question, 'five')).toThrow();
    });
  });

  describe('yes_no', () => {
    const question = { questionType: 'yes_no', options: [] };

    it('accepts true and false', () => {
      expect(validateAnswerForQuestion(question, true)).toBe(true);
      expect(validateAnswerForQuestion(question, false)).toBe(false);
    });

    it('rejects a non-boolean value', () => {
      expect(() => validateAnswerForQuestion(question, 'yes')).toThrow();
      expect(() => validateAnswerForQuestion(question, 1)).toThrow();
    });
  });

  describe('multiple_choice', () => {
    const question = { questionType: 'multiple_choice', options: ['Enrollment', 'Document Request'] };

    it('accepts one of the question\'s options', () => {
      expect(validateAnswerForQuestion(question, 'Enrollment')).toBe('Enrollment');
    });

    it('rejects a value not among the question\'s options', () => {
      expect(() => validateAnswerForQuestion(question, 'Other')).toThrow();
    });

    it('rejects a non-string value', () => {
      expect(() => validateAnswerForQuestion(question, 1)).toThrow();
    });
  });

  describe('short_text / long_text', () => {
    it('accepts and trims a string for short_text', () => {
      const question = { questionType: 'short_text', options: [] };
      expect(validateAnswerForQuestion(question, '  Great service  ')).toBe('Great service');
    });

    it('accepts and trims a string for long_text', () => {
      const question = { questionType: 'long_text', options: [] };
      expect(validateAnswerForQuestion(question, '  Very helpful staff.  ')).toBe('Very helpful staff.');
    });

    it('accepts an empty string (optional comment)', () => {
      const question = { questionType: 'long_text', options: [] };
      expect(validateAnswerForQuestion(question, '')).toBe('');
    });

    it('rejects a non-string value', () => {
      const question = { questionType: 'short_text', options: [] };
      expect(() => validateAnswerForQuestion(question, 123)).toThrow();
    });
  });

  it('rejects an unsupported question type', () => {
    const question = { questionType: 'essay', options: [] };
    expect(() => validateAnswerForQuestion(question, 'anything')).toThrow();
  });
});
