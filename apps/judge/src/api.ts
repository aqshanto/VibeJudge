// API-র সাথে কথা বলার client (শুধু /api/judge/* endpoint)

import type { JudgeJob, JudgeReport, ProblemData } from "@vibejudge/shared";

export class JudgeApi {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly workerName: string,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${this.baseUrl}/api/judge${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`${init.method ?? "GET"} ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return res;
  }

  /** কাজ না থাকলে API ~২৫ সেকেন্ড ধরে রাখে, তারপর null */
  async claim(): Promise<JudgeJob | null> {
    const res = await this.request("/claim?wait=25000", {
      method: "POST",
      body: JSON.stringify({ worker: this.workerName }),
      signal: AbortSignal.timeout(60_000),
    });
    return res.status === 204 ? null : ((await res.json()) as JudgeJob);
  }

  async problemData(problemId: string): Promise<ProblemData> {
    const res = await this.request(`/problems/${encodeURIComponent(problemId)}/data`, {
      signal: AbortSignal.timeout(120_000),
    });
    return (await res.json()) as ProblemData;
  }

  async report(submissionId: string, report: JudgeReport): Promise<void> {
    await this.request(`/submissions/${encodeURIComponent(submissionId)}/result`, {
      method: "POST",
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(30_000),
    });
  }
}
