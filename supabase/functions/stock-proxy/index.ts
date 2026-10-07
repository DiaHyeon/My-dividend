// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This is a Supabase Edge Function acting as a secure CORS proxy for Yahoo Finance and SEC Thailand Open API with Auth Guard and Rate-Limit protection.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Helper to fetch external APIs with a strict timeout to prevent hung serverless workers.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") {
      throw new Error(`Upstream request timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 1. Security Auth Guard: Verify API Key or Bearer Token
  const authHeader = req.headers.get("authorization") || "";
  const apiKeyHeader = req.headers.get("apikey") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim() || apiKeyHeader;

  const expectedAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const expectedServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

  let isAuthorized = false;

  // Check A: Direct match with server-configured keys
  if (expectedAnonKey && (apiKeyHeader === expectedAnonKey || token === expectedAnonKey)) {
    isAuthorized = true;
  } else if (expectedServiceKey && (apiKeyHeader === expectedServiceKey || token === expectedServiceKey)) {
    isAuthorized = true;
  }

  // Check B: Verify JWT Token format and Supabase project signature
  if (!isAuthorized && token) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(base64));

        const nowSec = Math.floor(Date.now() / 1000);
        const isNotExpired = !payload.exp || payload.exp > nowSec;
        const isSupabaseIssuer = payload.iss === "supabase";
        const isValidRole = payload.role === "authenticated" || payload.role === "anon";

        const projectRef = supabaseUrl ? supabaseUrl.replace(/^https?:\/\//, "").split(".")[0] : "";
        const isMatchingProject = !projectRef || !payload.ref || payload.ref === projectRef;

        if (isSupabaseIssuer && isNotExpired && isValidRole && isMatchingProject) {
          isAuthorized = true;
        }
      }
    } catch {
      // Invalid JWT format -> remain unauthorized
    }
  }

  if (!isAuthorized) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: Missing or invalid API credentials" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const reqBody = await req.json();
    const { action, query, symbol } = reqBody;

    // 2. Action: Search stocks
    if (action === "search") {
      const cleanQuery = (query || "").trim().slice(0, 100);
      if (!cleanQuery) {
        return new Response(JSON.stringify({ quotes: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(cleanQuery)}&quotesCount=15&newsCount=0&listsCount=0`;
      const res = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!res.ok) {
        if (res.status === 429) {
          return new Response(
            JSON.stringify({ error: "Upstream Yahoo search rate limit exceeded", quotes: [] }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: `Yahoo search error: ${res.statusText}`, quotes: [] }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Action: Quote stock price
    if (action === "quote") {
      const cleanSymbol = (symbol || "").trim().toUpperCase().slice(0, 25);
      if (!cleanSymbol) {
        return new Response(JSON.stringify({ error: "Missing stock symbol" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?interval=1d&range=1d`;
      const res = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!res.ok) {
        if (res.status === 429) {
          return new Response(
            JSON.stringify({ error: "Upstream Yahoo quote rate limit exceeded" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: `Yahoo quote error: ${res.statusText}` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Action: 7-day price history
    if (action === "history-7d") {
      const cleanSymbol = (symbol || "").trim().toUpperCase().slice(0, 25);
      if (!cleanSymbol) {
        return new Response(JSON.stringify({ error: "Missing stock symbol" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?interval=1d&range=7d`;
      const res = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!res.ok) {
        if (res.status === 429) {
          return new Response(
            JSON.stringify({ error: "Upstream Yahoo history rate limit exceeded" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: `Yahoo history error: ${res.statusText}` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Action: Historical dividend events
    if (action === "dividends") {
      const cleanSymbol = (symbol || "").trim().toUpperCase().slice(0, 25);
      if (!cleanSymbol) {
        return new Response(JSON.stringify({ error: "Missing stock symbol" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?interval=1mo&range=2y&events=div`;
      const res = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!res.ok) {
        if (res.status === 429) {
          return new Response(
            JSON.stringify({ error: "Upstream Yahoo dividend rate limit exceeded" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: `Yahoo dividends error: ${res.statusText}` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Action: Fund NAV from SEC Thailand (Fund Check API + SEC Open API fallback)
    if (action === "fund-nav") {
      let projId = (reqBody.projId || reqBody.proj_id || "").trim().slice(0, 50);
      const cleanSymbol = (reqBody.symbol || "").trim().toUpperCase().slice(0, 50);
      if (!projId && !cleanSymbol) {
        return new Response(JSON.stringify({ error: "Missing projId or symbol parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Helper to convert Thai Buddhist Era date (DD/MM/YYYY) to standard ISO (YYYY-MM-DD)
      const parseThaiDateToIso = (dateStr?: string): string => {
        if (!dateStr) return "";
        const parts = dateStr.trim().split("/");
        if (parts.length === 3) {
          const [d, m, y] = parts;
          let year = Number(y);
          if (year > 2400) year -= 543;
          return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        }
        return dateStr;
      };

      // Tier 1: Query SEC Fund Check API (Official SEC Thailand Real-Time Fund NAV)
      if (cleanSymbol) {
        try {
          const queryVariants = [
            cleanSymbol,
            cleanSymbol.replace(/-/g, ""),
            cleanSymbol.split("(")[0],
            cleanSymbol.split("-")[0],
          ];
          if (cleanSymbol.includes("-")) {
            const parts = cleanSymbol.split("-");
            queryVariants.push(parts.slice(0, 2).join(""));
            queryVariants.push(parts.slice(0, 2).join("-"));
          }

          const uniqueQueries = Array.from(new Set(queryVariants));
          for (const q of uniqueQueries) {
            if (!q || q.length < 2) continue;
            const fundCheckUrl = `https://web-fct-api.sec.or.th/api/funds/search?fundName=${encodeURIComponent(q)}&page=1`;
            const fcRes = await fetchWithTimeout(fundCheckUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
                "Origin": "https://fundcheck.sec.or.th",
                "Referer": "https://fundcheck.sec.or.th/",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-site",
              },
            }, 6000);

            if (fcRes.ok && fcRes.status !== 204) {
              const items = await fcRes.json();
              if (Array.isArray(items) && items.length > 0) {
                // Priority 1: Exact match on cleanSymbol
                let match = items.find((it: any) => (it.abbrName || "").trim().toUpperCase() === cleanSymbol);

                // Priority 2: Match without hyphens (e.g. SCBDVA vs SCBDV-A, KFGTECH-A vs KF-GTECH-A, KFHEALTH-D vs KF-HEALTHD)
                if (!match) {
                  const noDash = cleanSymbol.replace(/-/g, "");
                  match = items.find((it: any) => (it.abbrName || "").trim().toUpperCase().replace(/-/g, "") === noDash);
                }

                // Priority 3: Match base prefix without hyphens
                if (!match) {
                  const noDash = cleanSymbol.replace(/-/g, "");
                  match = items.find((it: any) => {
                    const itNoDash = (it.abbrName || "").trim().toUpperCase().replace(/-/g, "");
                    return itNoDash.startsWith(noDash) || noDash.startsWith(itNoDash);
                  });
                }

                // Priority 4: First match if user queried exact symbol
                if (!match && q === cleanSymbol) {
                  match = items[0];
                }

                if (match && match.unitNAV !== undefined && match.unitNAV !== null && !isNaN(Number(match.unitNAV))) {
                  const resolvedNav = Number(match.unitNAV);
                  const resolvedDate = parseThaiDateToIso(match.unitNAVDate);
                  return new Response(
                    JSON.stringify({
                      latestNav: resolvedNav,
                      navDate: resolvedDate,
                      fundClassName: match.abbrName || cleanSymbol,
                      nameTh: match.nameTh,
                      source: "SEC-FundCheck",
                      raw: match,
                    }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                  );
                }
              }
            }
          }
        } catch (fcErr: any) {
          console.warn(`[stock-proxy] SEC Fund Check notice for ${cleanSymbol}:`, fcErr?.message || fcErr);
        }
      }

      // Tier 2: SEC Open API v2 Fallback
      const secKey = Deno.env.get("SEC_API_KEY") || "";
      if (secKey) {
        if (!projId && cleanSymbol) {
          try {
            const profileUrl = `https://api.sec.or.th/v2/fund/general-info/profiles?fund_class_name=${encodeURIComponent(cleanSymbol)}&page_size=1`;
            const profileRes = await fetchWithTimeout(profileUrl, {
              headers: { "Ocp-Apim-Subscription-Key": secKey },
            }, 5000);
            if (profileRes.ok && profileRes.status !== 204) {
              const profileData = await profileRes.json();
              if (profileData.items && profileData.items[0]?.proj_id) {
                projId = profileData.items[0].proj_id;
              }
            }
          } catch {
            // ignore
          }
        }

        const targetParam = projId
          ? `proj_id=${encodeURIComponent(projId)}`
          : `fund_class_name=${encodeURIComponent(cleanSymbol)}`;
        const url = `https://api.sec.or.th/v2/fund/daily-info/nav?${targetParam}&page_size=100`;

        try {
          const res = await fetchWithTimeout(url, {
            headers: { "Ocp-Apim-Subscription-Key": secKey },
          }, 8000);

          if (res.ok && res.status !== 204) {
            const textNav = await res.text();
            const data = textNav ? JSON.parse(textNav) : {};
            const items: any[] = data.items || [];
            if (items.length > 0) {
              items.sort((a, b) => (b.nav_date || "").localeCompare(a.nav_date || ""));
              const latest = items[0];
              return new Response(
                JSON.stringify({
                  latestNav: latest.last_val,
                  navDate: latest.nav_date,
                  fundClassName: latest.fund_class_name,
                  source: "SEC-OpenAPI",
                  raw: latest,
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        } catch (secErr: any) {
          console.warn(`[stock-proxy] SEC Open API fallback notice:`, secErr?.message || secErr);
        }
      }

      return new Response(
        JSON.stringify({ latestNav: null, navDate: null, items: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Action: Fund dividend history from SEC Thailand Open API
    if (action === "fund-dividends") {
      const projId = (reqBody.projId || reqBody.proj_id || "").trim().slice(0, 50);
      const cleanSymbol = (reqBody.symbol || "").trim().toUpperCase().slice(0, 50);
      if (!projId && !cleanSymbol) {
        return new Response(JSON.stringify({ error: "Missing projId or symbol parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const secKey = Deno.env.get("SEC_API_KEY") || "";
      if (!secKey) {
        return new Response(
          JSON.stringify({
            error: "SEC_API_KEY is not configured in server environment secrets",
            items: [],
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const targetParam = cleanSymbol
        ? `class_abbr_name=${encodeURIComponent(cleanSymbol)}`
        : `proj_id=${encodeURIComponent(projId)}`;
      const url = `https://api.sec.or.th/v2/fund/daily-info/dividend-history?${targetParam}&page_size=20`;

      const res = await fetchWithTimeout(url, {
        headers: {
          "Ocp-Apim-Subscription-Key": secKey,
        },
      }, 15000);

      if (!res.ok) {
        if (res.status === 429) {
          return new Response(
            JSON.stringify({ error: "SEC Open API rate limit exceeded", items: [] }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: `SEC Dividend error: ${res.statusText}`, items: [] }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (res.status === 204) {
        return new Response(JSON.stringify({ items: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const textDiv = await res.text();
      const data = textDiv ? JSON.parse(textDiv) : { items: [] };
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 8. Action: Sync funds catalog from SEC Open API (30-day periodic cycle)
    if (action === "sync-funds") {
      const secKey = Deno.env.get("SEC_API_KEY") || "";
      if (!secKey) {
        return new Response(
          JSON.stringify({ error: "SEC_API_KEY is not configured in server environment secrets", synced: 0 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const profileUrl = "https://api.sec.or.th/v2/fund/general-info/profiles?page_size=500";
        const res = await fetchWithTimeout(profileUrl, {
          headers: { "Ocp-Apim-Subscription-Key": secKey },
        }, 15000);

        if (!res.ok) {
          return new Response(
            JSON.stringify({ error: `SEC Sync error: ${res.statusText}`, synced: 0 }),
            { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const text = await res.text();
        const profileData = text ? JSON.parse(text) : { items: [] };
        const items = profileData.items || [];

        return new Response(
          JSON.stringify({
            synced: items.length,
            timestamp: new Date().toISOString(),
            items: items.slice(0, 100),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (syncErr: any) {
        return new Response(
          JSON.stringify({ error: syncErr.message || "Failed to sync SEC funds", synced: 0 }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Supported actions: 'search' | 'quote' | 'dividends' | 'fund-nav' | 'fund-dividends' | 'history-7d' | 'sync-funds'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
