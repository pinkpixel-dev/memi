async function call(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach memi. Is `memi ui` still running?");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export const getStatus = () => call("GET", "/api/status");

export function listMemories(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") qs.set(key, String(value));
  }
  return call("GET", `/api/memories?${qs}`);
}

export const addMemory = (body) => call("POST", "/api/memories", body);
export const updateMemory = (id, body) => call("PATCH", `/api/memories/${id}`, body);
export const deleteMemory = (id) => call("DELETE", `/api/memories/${id}`);
