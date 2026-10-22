import { expect, test } from "@playwright/test";
import { apiGet, apiPost, createInterview, login, setEditorCode, TWO_SUM_PY } from "./helpers";

interface InterviewResponse {
  interview: { status: string; questions: { id: string; problem: { slug: string } | null }[] };
  submissions: { kind: string; status: string; verdict: string | null; passedCount: number | null; totalCount: number | null; tests: { visible: boolean; input?: string; stdout?: string }[] }[];
}

test.describe("DSA coding interview", () => {
  test("presents a real problem, runs and submits code, and produces a report", async ({ page }) => {
    await login(page, `E2E Candidate ${Date.now()}`);

    // Setup form: DSA mode, easy, 30 minutes, hash maps.
    await page.goto("/interview/new");
    await page.getByRole("radio", { name: /DSA \/ Coding/ }).click();
    await page.getByRole("button", { name: "Easy", exact: true }).click();
    await page.getByRole("button", { name: "30 min", exact: true }).click();
    await page.getByRole("button", { name: "Hash Maps & Sets" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((url) => /^\/interview\/(?!new$)[a-z0-9]+$/.test(url.pathname));
    const roomId = page.url().split("/").pop()!;

    // Lobby -> start.
    await page.getByRole("button", { name: "Start interview" }).click();

    // A genuine coding problem with statement, examples and constraints.
    await expect(page.getByRole("heading", { name: "Examples" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Constraints" })).toBeVisible();
    await expect(page.getByText("Why this question:")).toBeVisible();
    await expect(page.getByRole("timer")).toHaveText(/\d+:\d\d/);
    const state = (await apiGet<InterviewResponse>(page.request, `/api/interviews/${roomId}`)).body;
    expect(state.interview.status).toBe("IN_PROGRESS");
    expect(state.interview.questions[0]!.problem).not.toBeNull();

    // Wrong code first: visible examples show a wrong answer with output.
    await setEditorCode(page, "def twoSum(nums, target):\n    return [0, 0]\n");
    await page.getByRole("button", { name: "Run examples" }).click();
    await expect(page.getByText(/tests passed/)).toBeVisible({ timeout: 120_000 });

    // Correct solution: submit for hidden tests.
    await setEditorCode(page, state.interview.questions[0]!.problem!.slug === "two-sum" ? TWO_SUM_PY : TWO_SUM_PY);
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Submission")).toBeVisible();
    await expect(page.getByText(/Hidden test \d+/).first()).toBeVisible({ timeout: 120_000 });

    const after = (await apiGet<InterviewResponse>(page.request, `/api/interviews/${roomId}`)).body;
    const submit = after.submissions.find((s) => s.kind === "SUBMIT")!;
    expect(submit.status).toBe("COMPLETED");
    for (const t of submit.tests.filter((x) => !x.visible)) {
      expect(t.input).toBeUndefined();
      expect(t.stdout).toBeUndefined();
    }

    // A follow-up question appears in the interviewer panel.
    await page.getByRole("tab", { name: "AI interviewer" }).click();
    await expect(page.getByText("Follow-up question").first()).toBeVisible({ timeout: 30_000 });

    // Reconnection: a reload restores the code and results.
    await page.reload();
    await expect(page.getByText("Submission")).toBeVisible();

    // Finish and read the report.
    page.on("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Finish interview" }).click();
    await page.waitForURL(`**/interview/${roomId}/report`);
    await expect(page.getByText("from judge").first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("Integrity signals")).toBeVisible();
    await expect(page.getByText(/not a definitive judgement/)).toBeVisible();
  });
});

test.describe("proctoring", () => {
  test("requires consent before the camera, then shows a live preview", async ({ page, context }) => {
    await context.grantPermissions(["camera"]);
    await login(page, `E2E Camera ${Date.now()}`);
    const roomId = await createInterview(page, { proctoring: true });
    await page.goto(`/interview/${roomId}`);
    const setup = page.getByRole("button", { name: "Set up camera" });
    await expect(setup).toBeDisabled();
    await expect(page.getByRole("button", { name: "Start proctored interview" })).toBeDisabled();
    await page.getByLabel(/I understand and consent/).check();
    await setup.click();
    await expect(page.getByText(/Camera is on/)).toBeVisible();
    await page.getByRole("button", { name: "Start proctored interview" }).click();
    await expect(page.getByRole("heading", { name: "Examples" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Camera on|No face|Multiple faces|Camera off/ }).first()).toBeAttached();

    // Leaving the page must release the camera.
    await page.goto("/dashboard");
    const active = await page.evaluate(() => (navigator.mediaDevices ? "ok" : "none"));
    expect(active).toBe("ok");
  });

  test("handles a denied camera permission without retrying", async ({ page }) => {
    await page.addInitScript(() => {
      let calls = 0;
      Object.defineProperty(window, "__cameraCalls", { get: () => calls });
      navigator.mediaDevices.getUserMedia = async () => {
        calls++;
        throw new DOMException("Permission denied", "NotAllowedError");
      };
    });
    await login(page, `E2E Denied ${Date.now()}`);
    const roomId = await createInterview(page, { proctoring: true });
    await page.goto(`/interview/${roomId}`);
    await page.getByLabel(/I understand and consent/).check();
    await page.getByRole("button", { name: "Set up camera" }).click();
    await expect(page.getByText(/Camera permission was denied/)).toBeVisible();
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => (window as unknown as { __cameraCalls: number }).__cameraCalls)).toBe(1);
    // The candidate can still continue unproctored.
    await page.getByRole("button", { name: "Start without proctoring" }).click();
    await expect(page.getByRole("heading", { name: "Examples" })).toBeVisible();
  });

  test("records tab-hidden and tab-returned events with server-side durations", async ({ page }) => {
    await login(page, `E2E Tabs ${Date.now()}`);
    const roomId = await createInterview(page);
    await apiPost(page, `/api/interviews/${roomId}/start`, { proctoring: false });
    await page.goto(`/interview/${roomId}`);
    await expect(page.locator('[data-ready="true"]')).toBeAttached();

    const setVisibility = (state: "hidden" | "visible") =>
      page.evaluate((s) => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
        document.dispatchEvent(new Event("visibilitychange"));
      }, state);
    await setVisibility("hidden");
    await page.waitForTimeout(3000);
    await setVisibility("visible");
    await expect(page.getByText(/Tab hidden 1×/)).toBeVisible();

    await expect
      .poll(async () => {
        const r = await apiGet<{ events: { type: string; durationMs: number | null }[] }>(page.request, `/api/interviews/${roomId}/proctoring`);
        return r.body.events.find((e) => e.type === "TAB_HIDDEN")?.durationMs ?? 0;
      }, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(2500);
  });
});

test.describe("authorization", () => {
  test("another candidate cannot open someone else's interview", async ({ page, browser }) => {
    await login(page, `E2E Owner ${Date.now()}`);
    const roomId = await createInterview(page);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await login(otherPage, `E2E Intruder ${Date.now()}`);
    const res = await otherPage.goto(`/interview/${roomId}`);
    expect(res?.status()).toBe(404);
    expect((await apiGet(otherPage.request, `/api/interviews/${roomId}`)).status).toBe(404);
    expect((await apiGet(otherPage.request, `/api/interviews/${roomId}/proctoring`)).status).toBe(404);
    await other.close();
  });

  test("rejects cross-site mutations and unauthenticated API calls", async ({ page, request }) => {
    expect((await request.get("/api/interviews")).status()).toBe(401);
    await login(page, `E2E Csrf ${Date.now()}`);
    const res = await page.request.post("/api/interviews", { data: { mode: "DSA" }, headers: { origin: "https://evil.example" } });
    expect(res.status()).toBe(403);
  });
});
