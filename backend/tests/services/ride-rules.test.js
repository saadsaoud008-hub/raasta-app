import { describe, it, expect } from 'vitest';
import { assertTransition, estimate } from '../../src/services/ride-rules.js';
describe('ride lifecycle', () => {
  it.each([
    ['REQUESTED', 'ACCEPTED'],
    ['REQUESTED', 'CANCELLED'],
    ['ACCEPTED', 'CANCELLED'],
    ['ACCEPTED', 'COMPLETED'],
  ])('allows %s -> %s', (from, to) =>
    expect(() => assertTransition(from, to)).not.toThrow(),
  );
  it.each([
    ['REQUESTED', 'COMPLETED'],
    ['CANCELLED', 'ACCEPTED'],
    ['COMPLETED', 'CANCELLED'],
    ['ACCEPTED', 'REQUESTED'],
  ])('rejects %s -> %s', (from, to) =>
    expect(() => assertTransition(from, to)).toThrow(),
  );
  it('uses integer paisa and differentiates categories', () => {
    expect(estimate('ECONOMY').farePaisa).toBe(48000);
    expect(estimate('COMFORT').farePaisa).toBeGreaterThan(
      estimate('ECONOMY').farePaisa,
    );
  });
});
