// A centralized client helper for securely invoking the stock-proxy Supabase Edge Function with automatic authentication headers, request timeouts, and error handling.
import { supabase } from '../lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ycflookcrilaujmeillt.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const FUNCTION_NAME = 'stock-proxy';
const PROXY_URL = `${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`;

export interface ProxyResponse<T = any> {
  data: T | null;
  error: Error | null;
  status: number;
}

/**
 * Returns the default security headers for contacting Supabase Edge Functions.
 */
export function getProxyHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (SUPABASE_ANON_KEY) {
    headers['apikey'] = SUPABASE_ANON_KEY;
    headers['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  return headers;
}

/**
 * Invokes the stock-proxy Supabase Edge Function with automatic authentication and timeout control.
 *
 * @param payload The request body payload (must contain action and relevant parameters)
 * @param timeoutMs Timeout in milliseconds (default: 8000ms)
 */
export async function invokeStockProxy<T = any>(
  payload: Record<string, any>,
  timeoutMs: number = 8000
): Promise<ProxyResponse<T>> {
  // 1. First attempt: Use supabase-js SDK client functions invoke if available
  try {
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
      body: payload,
    });

    if (!error && data) {
      return { data: data as T, error: null, status: 200 };
    }

    if (error && error.message) {
      console.warn(`[ProxyClient] supabase.functions.invoke notice: ${error.message}`);
    }
  } catch (sdkErr: any) {
    console.warn(`[ProxyClient] supabase.functions.invoke exception, falling back to direct fetch:`, sdkErr?.message || sdkErr);
  }

  // 2. Direct HTTP Fetch fallback with strict timeout and security headers
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: getProxyHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.status === 204) {
      return { data: null, error: null, status: 204 };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = `Proxy error HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed?.error) errMsg = parsed.error;
      } catch {
        if (errText) errMsg = `${errMsg}: ${errText}`;
      }
      return { data: null, error: new Error(errMsg), status: res.status };
    }

    const json = await res.json();
    return { data: json as T, error: null, status: res.status };
  } catch (fetchErr: any) {
    clearTimeout(timer);
    const isTimeout = fetchErr?.name === 'AbortError';
    const message = isTimeout
      ? `Request timed out after ${timeoutMs}ms`
      : fetchErr?.message || 'Network request failed';
    return { data: null, error: new Error(message), status: isTimeout ? 408 : 0 };
  }
}
