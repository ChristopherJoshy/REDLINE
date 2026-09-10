export function apiUrl(path: string): string {
  const raw = import.meta.env.VITE_API_URL;
  if (typeof raw === "string" && raw.trim() !== "") {
    const base = raw.trim().replace(/\/+$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }
  return path;
}

export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = apiUrl(input);
  return fetch(url, {
    credentials: "include",
    ...init,
  });
}
