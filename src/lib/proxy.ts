import type { NextRequest } from "next/server";

interface ProxyOptions {
  path?: string;
}

// Proxies the incoming NextRequest to the configured backend.
export async function proxyRequest(
  req: NextRequest,
  targetBase: string,
  options?: ProxyOptions
): Promise<Response> {
  const targetPath = options?.path ?? req.nextUrl.pathname;
  const targetUrl = new URL(targetPath, targetBase);
  if (req.nextUrl.search) {
    targetUrl.search = req.nextUrl.searchParams.toString();
  }

  const headers = new Headers(req.headers);
  headers.delete("host");

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const init: RequestInit = {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: "manual",
  };

  try {
    const upstreamResponse = await fetch(targetUrl, init);
    const responseHeaders = new Headers(upstreamResponse.headers);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`[proxy] ${req.method} ${targetUrl.toString()}`, error);
    return new Response("Upstream request failed", { status: 502 });
  }
}
