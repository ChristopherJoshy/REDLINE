export default async function handler(req, res) {
  const backendUrl =
    process.env.BACKEND_URL ||
    process.env.VITE_API_URL ||
    "http://3.110.88.35:25565";

  const rawPath = req.url || "/";
  const path = rawPath.startsWith("/api") ? rawPath : `/api${rawPath}`;
  const target = `${backendUrl.replace(/\/+$/, "")}${path}`;

  try {
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (lower !== "host" && lower !== "connection" && lower !== "content-length") {
        headers[key] = Array.isArray(value) ? value.join("; ") : value;
      }
    }

    let body = undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const response = await fetch(target, {
      method: req.method,
      headers,
      body,
    });

    res.status(response.status);

    for (const [key, value] of response.headers.entries()) {
      const lower = key.toLowerCase();
      if (lower === "set-cookie") {
        res.setHeader(key, value);
      } else if (lower !== "content-encoding" && lower !== "transfer-encoding") {
        res.setHeader(key, value);
      }
    }

    const data = await response.text();
    res.send(data);
  } catch (err) {
    console.error("Vercel API Proxy error:", err);
    res.status(502).json({ error: "Backend proxy unreachable" });
  }
}
