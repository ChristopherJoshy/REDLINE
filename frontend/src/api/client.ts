export function apiUrl(path: string): string {
  const raw = import.meta.env.VITE_API_URL;
  if (typeof raw === "string" && raw.trim() !== "") {
    const base = raw.trim().replace(/\/+$/, "");
    // If the browser page is loaded over HTTPS, never fetch an insecure HTTP endpoint directly (prevents Mixed Content block)
    if (typeof window !== "undefined" && window.location.protocol === "https:" && base.startsWith("http://")) {
      const cleanPath = path.startsWith("/") ? path : `/${path}`;
      return cleanPath;
    }
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }
  return path;
}

export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = apiUrl(input);
  const headers = new Headers(init?.headers);
  headers.set("ngrok-skip-browser-warning", "true");
  return fetch(url, {
    credentials: "include",
    ...init,
    headers,
  });
}
