import { describe, expect, it } from 'vitest';
import { readPath } from './pe';

describe('readPath', () => {
  it('reads dot, bracket and index paths, including keys that contain dots', () => {
    const claims = { vct: 'X', a: { b: [1, 2] }, 'org.iso.18013.5.1': { family_name: 'Kumar' } };
    expect(readPath(claims, '$.vct')).toBe('X');
    expect(readPath(claims, '$.a.b[1]')).toBe(2);
    expect(readPath(claims, "$['org.iso.18013.5.1']['family_name']")).toBe('Kumar');
    expect(readPath(claims, '$["a"]["b"]')).toEqual([1, 2]);
    expect(readPath(claims, '$.missing.x')).toBeUndefined();
  });
});
