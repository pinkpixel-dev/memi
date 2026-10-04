export type Scope = "global" | "project";

export interface Memory {
  id: number;
  scope: Scope;
  project: string | null;
  agent: string | null;
  category: string;
  content: string;
  tags: string[];
  importance: number;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewMemory {
  content: string;
  scope?: Scope;
  project?: string | null;
  agent?: string | null;
  category?: string;
  tags?: string[];
  importance?: number;
  pinned?: boolean;
}

export interface MemoryPatch {
  content?: string;
  scope?: Scope;
  project?: string | null;
  category?: string;
  tags?: string[];
  importance?: number;
  pinned?: boolean;
}

export const BUILTIN_CATEGORIES: Record<string, string> = {
  decision: "A choice that was made, with the reasoning",
  preference: "How the user likes things done",
  fact: "A durable fact about the project, system, or user",
  error: "Something that failed and what to avoid next time",
  todo: "Follow-up work that should not be forgotten",
  context: "Background that helps future sessions",
};

export const DEFAULT_CATEGORY = "context";
export const MAX_CONTENT_LENGTH = 8000;

export class MemiError extends Error {}
