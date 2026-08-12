import { describe, it, expect, afterEach, vi } from 'vitest';

// env.js validates and freezes its config at import time, so each
// scenario needs a fresh module evaluation under different process.env —
// vi.resetModules() clears vitest's module registry so the next import()
// re-evaluates the module instead of returning the cached instance.
async function importEnvFresh() {
  vi.resetModules();
  return import('../../src/config/env.js');
}

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  Object.keys(process.env).forEach((key) => {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  });
  Object.assign(process.env, ORIGINAL_ENV);
}

describe('config/env production safety', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('fails fast when NODE_ENV=production and CLIENT_URL is unset', async () => {
    process.env.NODE_ENV = 'production';
    // Empty string (not delete) — env.js's own dotenv.config() call would
    // otherwise refill a deleted key from the real backend/.env on disk,
    // since dotenv only skips keys already present in process.env.
    process.env.CLIENT_URL = '';

    await expect(importEnvFresh()).rejects.toThrow(/CLIENT_URL/);
  });

  it('starts normally when NODE_ENV=production and CLIENT_URL is set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CLIENT_URL = 'https://fbms.example.netlify.app';

    const { env } = await importEnvFresh();

    expect(env.nodeEnv).toBe('production');
    expect(env.clientUrl).toBe('https://fbms.example.netlify.app');
  });

  it('defaults Swagger "Try it out" to disabled in production when unset', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CLIENT_URL = 'https://fbms.example.netlify.app';
    delete process.env.API_DOCS_TRY_IT_OUT_ENABLED;

    const { env } = await importEnvFresh();

    expect(env.apiDocsTryItOutEnabled).toBe(false);
  });

  it('enables Swagger "Try it out" in production only when explicitly set to true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CLIENT_URL = 'https://fbms.example.netlify.app';
    process.env.API_DOCS_TRY_IT_OUT_ENABLED = 'true';

    const { env } = await importEnvFresh();

    expect(env.apiDocsTryItOutEnabled).toBe(true);
  });

  it('keeps Swagger "Try it out" opt-out (enabled by default) outside production', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.API_DOCS_TRY_IT_OUT_ENABLED;

    const { env } = await importEnvFresh();

    expect(env.nodeEnv).toBe('development');
    expect(env.apiDocsTryItOutEnabled).toBe(true);
  });

  it('does not require CLIENT_URL outside production', async () => {
    process.env.NODE_ENV = 'development';
    process.env.CLIENT_URL = '';

    const { env } = await importEnvFresh();

    expect(env.clientUrl).toBe('http://localhost:5173');
  });
});
