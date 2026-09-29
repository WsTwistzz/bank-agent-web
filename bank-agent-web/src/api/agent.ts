/**
 * Agent 桥接服务客户端（经 Vite 代理 /api/agent → http://127.0.0.1:8099）。
 *
 * 后端 bank-agent 只有 CLI 与 WebRTC 两种入口、没有 HTTP 对话接口，也不带 CORS，
 * 因此由前端仓库内的 server/agent_bridge.py 把运行时包成 SSE。这里负责解析。
 */

const AGENT_BASE = "/api/agent";

/** 后端 Agent 的待授权动作（Human-in-the-loop 权限卡的唯一数据源）。 */
export interface PendingAction {
  action_id: string;
  user_id: string;
  session_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  risk_level: "GREEN" | "YELLOW" | "RED";
  status: string;
  expires_at?: string;
}

/** frontend_events.jsonl 的投影事件（见 bank_agent/trace.py::FrontendEventLogger）。 */
export type FrontendEvent =
  | { type: "message"; role: "user" | "assistant"; content: string; specialist?: string | null }
  | { type: "reasoning"; stage: string; summary: string; specialist?: string | null }
  | {
      type: "tool";
      status: "running" | "completed" | "failed";
      tool: string;
      display_name?: string;
      capability?: string;
      domain?: string;
      access?: string;
      tags?: string[];
      duration_ms?: number;
      result?: { success?: boolean; data?: unknown; error?: string | null };
    }
  | { type: "error"; summary: string };

export interface AgentEvent extends Record<string, unknown> {
  event_id?: string;
  sequence?: number;
  turn_id?: string;
}

export interface AgentHealth {
  ready: boolean;
  agent: { ready: boolean; running: boolean; reason: string };
  bank: { ready: boolean; base_url: string };
}

/** 桥接服务不可达或后端未就绪时抛出，AgentPage 据此回落本地演示。 */
export class AgentUnavailable extends Error {
  reason: string;

  constructor(message: string, reason = "") {
    super(message);
    this.name = "AgentUnavailable";
    this.reason = reason;
  }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(AGENT_BASE + path, init);
  } catch {
    throw new AgentUnavailable("无法连接 Agent 桥接服务（/api/agent）：请先启动 server/agent_bridge.py");
  }
  if (response.status === 503) {
    let reason = "";
    try {
      reason = (await response.json())?.detail ?? "";
    } catch {
      reason = "";
    }
    throw new AgentUnavailable(reason || "后端 Agent 未就绪", reason);
  }
  if (!response.ok) {
    throw new AgentUnavailable(`桥接服务返回 ${response.status}`);
  }
  return (await response.json()) as T;
}

/** 就绪探测：桥接服务是否可达 + 后端 Agent / Mock Bank 是否可用。 */
export async function checkAgentHealth(): Promise<AgentHealth> {
  return getJson<AgentHealth>("/health");
}

export interface ChatHandlers {
  onEvent?: (event: AgentEvent) => void;
  onOtp?: (code: string) => void;
  signal?: AbortSignal;
}

export interface ChatResult {
  response: string;
  error: string | null;
  durationMs: number;
}

/** 逐行解析 SSE 帧，返回 [event, data] 对。 */
function parseFrame(frame: string): [string, unknown] | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  try {
    return [event, JSON.parse(dataLines.join("\n"))];
  } catch {
    return null;
  }
}

/**
 * 发起一轮对话并消费 SSE 流。
 * 逐条转发 frontend_events 投影事件（onEvent），验证码单独回调（onOtp）。
 */
export async function streamChat(
  params: { userId: string; sessionId: string; message: string },
  handlers: ChatHandlers = {},
): Promise<ChatResult> {
  const { userId, sessionId, message } = params;
  let response: Response;
  try {
    response = await fetch(AGENT_BASE + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, session_id: sessionId, message }),
      signal: handlers.signal,
    });
  } catch {
    throw new AgentUnavailable("无法连接 Agent 桥接服务（/api/agent）：请先启动 server/agent_bridge.py");
  }
  if (response.status === 503) {
    let reason = "";
    try {
      reason = (await response.json())?.detail ?? "";
    } catch {
      reason = "";
    }
    throw new AgentUnavailable(reason || "后端 Agent 未就绪", reason);
  }
  if (!response.ok || !response.body) {
    throw new AgentUnavailable(`桥接服务返回 ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ChatResult = { response: "", error: null, durationMs: 0 };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const parsed = parseFrame(frame);
      if (!parsed) continue;
      const [event, data] = parsed as [string, Record<string, unknown>];
      if (event === "event") handlers.onEvent?.(data as AgentEvent);
      else if (event === "otp" && typeof data.code === "string") handlers.onOtp?.(data.code);
      else if (event === "done") {
        result = {
          response: String(data.response ?? ""),
          error: (data.error as string | null) ?? null,
          durationMs: Number(data.duration_ms ?? 0),
        };
      }
    }
  }
  return result;
}