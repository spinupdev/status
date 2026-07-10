export interface Service {
  slug: string;
  name: string;
  product: string;
  kind: "frontend" | "backend";
  url: string;
}

export interface Ping {
  t: string;
  ok: boolean;
  ms: number;
  status: number;
}

export interface DailyEntry {
  date: string;
  checks: number;
  upChecks: number;
  totalMs: number;
}

export interface Incident {
  slug: string;
  name: string;
  start: string;
  end: string | null;
}

export interface ServiceState {
  status: "up" | "down";
  since: string;
}

export type StateMap = Record<string, ServiceState>;

export interface CheckResult {
  ok: boolean;
  status: number;
  ms: number;
  error?: string;
}

export interface LastCheck {
  t: string;
  results: Record<string, CheckResult>;
}
