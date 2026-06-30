import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getAiService, verifyBetaAccessCode } from './aiService';

const BETA_STORAGE_KEY = 'job-map-v0.3-beta-access';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('uses relative API paths when VITE_API_BASE_URL is not configured', async () => {
  await verifyBetaAccessCode('private-beta');

  expect(fetch).toHaveBeenCalledWith(
    '/api/beta/access',
    expect.objectContaining({
      method: 'POST'
    })
  );
});

test('uses VITE_API_BASE_URL for backend requests when configured', async () => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://resume-api.onrender.com/');
  window.localStorage.setItem(BETA_STORAGE_KEY, JSON.stringify({ authorized: true, betaAccessCode: 'private-beta' }));
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
    configured: false,
    mode: 'demo',
    message: 'demo'
  }));

  await getAiService().getStatus();

  expect(fetch).toHaveBeenCalledWith(
    'https://resume-api.onrender.com/api/ai/status',
    expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        'x-beta-access-code': 'private-beta'
      })
    })
  );
});
