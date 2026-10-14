/**
 * VoxNova REST API Client
 * Connects the Next.js frontend to the FastAPI backend endpoints for
 * voice assistants management and call logs.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export interface Assistant {
  id: string;
  name: string;
  description?: string | null;
  stt_provider: string;
  llm_provider: string;
  llm_model: string;
  tts_provider: string;
  tts_voice_id: string;
  system_prompt: string;
  first_message?: string | null;
  end_call_phrases?: string[] | null;
  silence_timeout_seconds?: number | null;
  stt_api_key?: string | null;
  llm_api_key?: string | null;
  tts_api_key?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type AssistantInput = Partial<Omit<Assistant, 'id' | 'created_at' | 'updated_at'>>;

export interface TranscriptItem {
  role: 'user' | 'assistant' | string;
  text: string;
  timestamp?: string;
}

export interface LatencyMetrics {
  total_e2e_ms?: number;
  stt_latency_ms?: number;
  llm_ttft_ms?: number;
  tts_ttfa_ms?: number;
  [key: string]: number | undefined;
}

export interface CallLog {
  id: string;
  assistant_id?: string | null;
  session_id: string;
  status: string;
  duration_seconds: number;
  end_reason: string;
  transcript: TranscriptItem[];
  latency_metrics: LatencyMetrics;
  cost_usd: number;
  created_at: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  if (!response.ok) {
    let errorMessage = `API request failed with status ${response.status} (${response.statusText})`;
    try {
      const errorBody = await response.json();
      if (errorBody?.detail) {
        errorMessage = typeof errorBody.detail === 'string'
          ? errorBody.detail
          : JSON.stringify(errorBody.detail);
      } else if (errorBody?.message) {
        errorMessage = String(errorBody.message);
      }
    } catch {
      // Response body was not JSON; use default status message
    }
    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

/**
 * Fetch all configured voice assistants ordered by creation date descending.
 * Corresponds to backend route: GET /api/assistants
 */
export async function fetchAssistants(): Promise<Assistant[]> {
  const response = await fetch(`${API_BASE}/api/assistants`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });
  return handleResponse<Assistant[]>(response);
}

/**
 * Fetch historical call logs with optional pagination limit.
 * Corresponds to backend route: GET /api/calls?limit={limit}
 */
export async function fetchCallLogs(limit: number = 50): Promise<CallLog[]> {
  const url = new URL(`${API_BASE}/api/calls`);
  if (limit) {
    url.searchParams.set('limit', String(limit));
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });
  return handleResponse<CallLog[]>(response);
}

/**
 * Create a new voice assistant.
 * Corresponds to backend route: POST /api/assistants
 */
export async function createAssistant(data: AssistantInput | Partial<Assistant>): Promise<Assistant> {
  const response = await fetch(`${API_BASE}/api/assistants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse<Assistant>(response);
}

/**
 * Update an existing voice assistant by ID.
 * Corresponds to backend route: PATCH /api/assistants/{id}
 */
export async function updateAssistant(id: string, data: AssistantInput | Partial<Assistant>): Promise<Assistant> {
  const response = await fetch(`${API_BASE}/api/assistants/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse<Assistant>(response);
}

/**
 * Delete a voice assistant by ID.
 * Corresponds to backend route: DELETE /api/assistants/{id}
 */
export async function deleteAssistant(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/assistants/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      'Accept': 'application/json',
    },
  });
  return handleResponse<void>(response);
}
