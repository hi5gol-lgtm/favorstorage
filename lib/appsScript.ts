const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const APPS_SCRIPT_API_KEY = process.env.APPS_SCRIPT_API_KEY;

function assertConfigured() {
  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_API_KEY) {
    throw new Error('APPS_SCRIPT_URL / APPS_SCRIPT_API_KEY 환경변수가 설정되지 않았습니다.');
  }
}

export async function callAppsScriptGet(action: string, params: Record<string, string> = {}) {
  assertConfigured();
  const url = new URL(APPS_SCRIPT_URL as string);
  url.searchParams.set('action', action);
  url.searchParams.set('apiKey', APPS_SCRIPT_API_KEY as string);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow', cache: 'no-store' });
  return res.json();
}

export async function callAppsScriptPost(body: Record<string, unknown>) {
  assertConfigured();
  const res = await fetch(APPS_SCRIPT_URL as string, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, apiKey: APPS_SCRIPT_API_KEY }),
    cache: 'no-store'
  });
  return res.json();
}
