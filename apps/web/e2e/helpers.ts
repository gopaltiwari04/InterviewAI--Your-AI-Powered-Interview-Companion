import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Signs in with the dev-only test provider (AUTH_TEST_LOGIN=enabled, non-production). */
export async function login(page: Page, name: string) {
  await page.goto("/login");
  await page.getByLabel("Test user name").fill(name);
  await page.getByRole("button", { name: /Test login/ }).click();
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
}

/** API call with the page's session cookie and a same-origin Origin header (required for mutations). */
export async function apiPost<T>(page: Page, path: string, body: unknown): Promise<T> {
  const origin = new URL(page.url()).origin;
  const res = await page.request.post(path, { data: body, headers: { origin } });
  expect(res.ok(), `${path} -> ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}

export async function apiGet<T>(request: APIRequestContext, path: string): Promise<{ status: number; body: T }> {
  const res = await request.get(path);
  return { status: res.status(), body: (await res.json().catch(() => null)) as T };
}

export async function createInterview(page: Page, overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await apiPost<{ id: string }>(page, "/api/interviews", {
    mode: "DSA",
    language: "python",
    difficulty: "EASY",
    durationMinutes: 30,
    topics: ["hashing"],
    adaptive: true,
    proctoring: false,
    ...overrides,
  });
  return res.id;
}

/** Replaces the Monaco editor content (the editor is loaded from a CDN). */
export async function setEditorCode(page: Page, code: string) {
  await page.waitForFunction(() => Boolean((window as unknown as { monaco?: unknown }).monaco), null, { timeout: 60_000 });
  await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco: { editor: { getModels(): { setValue(v: string): void }[] } } }).monaco;
    monaco.editor.getModels()[0]!.setValue(c);
  }, code);
}

export const TWO_SUM_PY = `def twoSum(nums: List[int], target: int) -> List[int]:
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
    return []
`;
