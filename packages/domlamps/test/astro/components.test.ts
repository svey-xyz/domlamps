import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import Box from '../../astro/Box.astro';
import DomLamps from '../../astro/DomLamps.astro';
import Light from '../../astro/Light.astro';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

describe('<Box>', () => {
  it('renders data-box with only the props that were passed', async () => {
    const html = await container.renderToString(Box, { props: { z: 40 } });
    expect(html).toContain('data-box');
    expect(html).toContain('data-material="solid"');
    expect(html).toContain('style="--lamp-z:40"');
    expect(html).not.toContain('data-opacity');
  });

  it('maps material, tint and overrides, and keeps the caller style', async () => {
    const html = await container.renderToString(Box, {
      props: { as: 'button', z: 10, material: 'glass', tint: '#ffae3d', opacity: 0.3, shine: 0.5, style: 'left:0' },
    });
    expect(html).toMatch(/^<button/);
    expect(html).toContain('data-material="glass"');
    expect(html).toContain('data-opacity="0.3"');
    expect(html).toContain('data-shine="0.5"');
    expect(html).toContain('style="--lamp-z:10;--lamp-tint:#ffae3d;left:0"');
  });

  it('emits no style attribute when nothing is set', async () => {
    expect(await container.renderToString(Box)).not.toContain('style=');
  });
});

describe('<Light>', () => {
  it('maps props to --lamp-* properties, with degrees for angles', async () => {
    const html = await container.renderToString(Light, {
      props: { type: 'spot', z: -12, radius: 820, color: '#ffc47e', dir: 45, cone: 30, size: 16, flicker: 0.2 },
    });
    expect(html).toContain('data-light="spot"');
    expect(html).toContain('data-flicker="0.2"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="domlamps-light"');
    expect(html).toContain(
      'style="--lamp-height:-12;--lamp-radius:820;--lamp-color:#ffc47e;--lamp-dir:45deg;--lamp-cone:30deg;--lamp-size:16"',
    );
  });

  it('merges classes', async () => {
    const html = await container.renderToString(Light, { props: { class: 'candle' } });
    expect(html).toContain('class="domlamps-light candle"');
  });
});

describe('<DomLamps>', () => {
  it('renders the custom element with its attributes', async () => {
    const html = await container.renderToString(DomLamps, { props: { scale: 0.25, ambient: '#000' } });
    expect(html).toMatch(/<dom-lamps scale="0.25" ambient="#000"/);
  });
});
