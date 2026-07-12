export default async function handler() {
  const scanUrl = process.env.POLITILY_SCAN_URL;
  if (!scanUrl) {
    return new Response("POLITILY_SCAN_URL is not configured.", { status: 500 });
  }

  const headers = {};
  if (process.env.POLITILY_SCAN_TOKEN) {
    headers.Authorization = `Bearer ${process.env.POLITILY_SCAN_TOKEN}`;
  }

  const response = await fetch(scanUrl, {
    method: "POST",
    headers,
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") || "text/plain" },
  });
}

export const config = {
  schedule: "*/15 * * * *",
};
