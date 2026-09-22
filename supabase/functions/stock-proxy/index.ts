// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This is a Supabase Edge Function acting as a CORS proxy for Yahoo Finance stock search and quotes.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const reqBody = await req.json();
    const { action, query, symbol } = reqBody;

    if (action === "search") {
      const cleanQuery = (query || "").trim();
      if (!cleanQuery) {
        return new Response(JSON.stringify({ quotes: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(cleanQuery)}&quotesCount=8`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: `Yahoo search error: ${res.statusText}` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "quote") {
      const cleanSymbol = (symbol || "").trim().toUpperCase();
      if (!cleanSymbol) {
        return new Response(JSON.stringify({ error: "Missing stock symbol" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?interval=1d&range=1d`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!res.ok) {
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

    if (action === "history-7d") {
      const cleanSymbol = (symbol || "").trim().toUpperCase();
      if (!cleanSymbol) {
        return new Response(JSON.stringify({ error: "Missing stock symbol" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?interval=1d&range=7d`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!res.ok) {
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

    if (action === "dividends") {
      const cleanSymbol = (symbol || "").trim().toUpperCase();
      if (!cleanSymbol) {
        return new Response(JSON.stringify({ error: "Missing stock symbol" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?interval=1mo&range=2y&events=div`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!res.ok) {
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

    if (action === "fund-nav") {
      const projId = (reqBody.projId || reqBody.proj_id || "").trim();
      const symbol = (reqBody.symbol || "").trim().toUpperCase();
      if (!projId && !symbol) {
        return new Response(JSON.stringify({ error: "Missing projId or symbol parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const secKey = Deno.env.get("SEC_API_KEY") || "";
      const targetParam = projId
        ? `proj_id=${encodeURIComponent(projId)}`
        : `fund_class_name=${encodeURIComponent(symbol)}`;
      const url = `https://api.sec.or.th/v2/fund/daily-info/nav?${targetParam}&page_size=100`;
      const res = await fetch(url, {
        headers: {
          "Ocp-Apim-Subscription-Key": secKey,
        },
      });

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: `SEC NAV error: ${res.statusText}` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (res.status === 204) {
        return new Response(JSON.stringify({ latestNav: null, navDate: null, items: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const textNav = await res.text();
      const data = textNav ? JSON.parse(textNav) : {};
      const items: any[] = data.items || [];
      if (items.length === 0) {
        return new Response(JSON.stringify({ latestNav: null, navDate: null, items: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Sort by nav_date descending to get the most recent NAV
      items.sort((a, b) => (b.nav_date || "").localeCompare(a.nav_date || ""));
      const latest = items[0];

      return new Response(
        JSON.stringify({
          latestNav: latest.last_val,
          navDate: latest.nav_date,
          fundClassName: latest.fund_class_name,
          raw: latest,
          history: items.slice(0, 10),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "fund-dividends") {
      const projId = (reqBody.projId || reqBody.proj_id || "").trim();
      const symbol = (reqBody.symbol || "").trim().toUpperCase();
      if (!projId && !symbol) {
        return new Response(JSON.stringify({ error: "Missing projId or symbol parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const secKey = Deno.env.get("SEC_API_KEY") || "";
      const targetParam = symbol
        ? `class_abbr_name=${encodeURIComponent(symbol)}`
        : `proj_id=${encodeURIComponent(projId)}`;
      const url = `https://api.sec.or.th/v2/fund/daily-info/dividend-history?${targetParam}&page_size=20`;
      const res = await fetch(url, {
        headers: {
          "Ocp-Apim-Subscription-Key": secKey,
        },
      });

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: `SEC Dividend error: ${res.statusText}` }),
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

    return new Response(
      JSON.stringify({ error: "Invalid action. Supported actions: 'search' | 'quote' | 'dividends' | 'fund-nav' | 'fund-dividends' | 'history-7d'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
