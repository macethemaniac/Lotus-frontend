import { lotusWsUrl } from "@/config/env";

export type ExecutionTopic =
  | `execution:user:${string}`
  | `execution:quote:${string}`
  | `execution:positions:${string}:${string}:${string}`;

export type ExecutionWsEvent = {
  type:
    | "EXECUTION_STATUS_UPDATE"
    | "EXECUTION_POSITION_UPDATE"
    | "EXECUTION_READINESS_UPDATE"
    | "EXECUTION_BALANCE_UPDATE";
  topic: ExecutionTopic;
  emittedAt: string;
  payload: unknown;
};

export type ExecutionWsState = "idle" | "connecting" | "open" | "closed" | "error";

export function openExecutionSocket(input: {
  onEvent: (event: ExecutionWsEvent) => void;
  onStateChange: (state: ExecutionWsState) => void;
}): {
  socket: WebSocket;
  subscribe: (topic: ExecutionTopic) => void;
  unsubscribe: (topic: ExecutionTopic) => void;
} {
  input.onStateChange("connecting");
  const socket = new WebSocket(lotusWsUrl());
  socket.addEventListener("open", () => input.onStateChange("open"));
  socket.addEventListener("close", () => input.onStateChange("closed"));
  socket.addEventListener("error", () => input.onStateChange("error"));
  socket.addEventListener("message", (event) => {
    const parsed = parseMessage(event.data);
    if (isExecutionEvent(parsed)) input.onEvent(parsed);
  });

  return {
    socket,
    subscribe: (topic) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ action: "subscribe", topic }));
    },
    unsubscribe: (topic) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ action: "unsubscribe", topic }));
    },
  };
}

function parseMessage(data: unknown): unknown {
  try {
    return JSON.parse(String(data));
  } catch {
    return null;
  }
}

function isExecutionEvent(value: unknown): value is ExecutionWsEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return typeof event.type === "string" && event.type.startsWith("EXECUTION_") && typeof event.topic === "string";
}
