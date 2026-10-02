import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROPERTIES } from '../../src/properties';

const css = readFileSync(new URL('../../src/domlamps.css', import.meta.url), 'utf8');

describe('PROPERTIES', () => {
  it('are all --lamp- prefixed and unique', () => {
    const names = PROPERTIES.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^--lamp-[a-z-]+$/);
  });

  it('match the @property rules in domlamps.css', () => {
    const rules = [...css.matchAll(/@property\s+(--[\w-]+)\s*\{([^}]*)\}/g)].map(([, name, body]) => ({
      name,
      syntax: /syntax:\s*'([^']+)'/.exec(body ?? '')?.[1],
      initialValue: /initial-value:\s*([^;]+);/.exec(body ?? '')?.[1]?.trim(),
      inherits: /inherits:\s*(\w+)/.exec(body ?? '')?.[1],
    }));
    expect(rules).toEqual(
      PROPERTIES.map((p) => ({ name: p.name, syntax: p.syntax, initialValue: p.initialValue, inherits: 'false' })),
    );
  });
});
