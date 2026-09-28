import { formatTimeInput } from '../src/utils/timeInput';

describe('formatTimeInput', () => {
  it('inserts the colon after two digits', () => {
    expect(formatTimeInput('0930')).toBe('09:30');
  });

  it('accepts pasted punctuation and only retains four digits', () => {
    expect(formatTimeInput('09:30pm')).toBe('09:30');
  });

  it('keeps an incomplete entry editable', () => {
    expect(formatTimeInput('09')).toBe('09');
  });
});
