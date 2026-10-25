import { describe, expect, it } from 'vitest';
import { splitDiff } from './TamperDiff';

describe('splitDiff', () => {
  it('isolates the changed characters', () => {
    expect(splitDiff('abcXdef', 'abcYdef')).toEqual({ prefix: 'abc', before: 'X', after: 'Y', suffix: 'def' });
  });
  it('handles insertions', () => {
    expect(splitDiff('Ramesh', 'Ramesh (edited)')).toEqual({ prefix: 'Ramesh', before: '', after: ' (edited)', suffix: '' });
  });
});
