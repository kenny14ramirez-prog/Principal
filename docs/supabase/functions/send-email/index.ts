import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

// Remitente configurable. Por defecto se usa el dominio de prueba de Resend
// (onboarding@resend.dev), que está verificado y permite envíos inmediatos.
// Para producción, verifica el dominio bonaorigen.co en el dashboard de Resend
// y define la variable de entorno FROM_EMAIL = "BONA origen <noreply@bonaorigen.co>".
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "BONA origen <onboarding@resend.dev>";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { to, subject, html, text } = body;

    if (!to || !subject || (!html && !text)) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, subject, html/text" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Enviar email via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: subject,
        html: html || undefined,
        text: text || undefined,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      // Si falla por dominio no verificado, reintentar con el sender de prueba
      const isDomainError = resendData && resendData.message &&
        (String(resendData.message).toLowerCase().includes("domain") ||
         String(resendData.message).toLowerCase().includes("verify"));

      if (isDomainError && FROM_EMAIL !== "BONA origen <onboarding@resend.dev>") {
        const fallbackRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "BONA origen <onboarding@resend.dev>",
            to: [to],
            subject: subject,
            html: html || undefined,
            text: text || undefined,
          }),
        });
        const fallbackData = await fallbackRes.json();
        if (fallbackRes.ok) {
          return new Response(JSON.stringify({ ok: true, id: fallbackData.id, fallback: true }), {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "Resend API error", detail: fallbackData }), {
          status: fallbackRes.status,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Resend API error", detail: resendData }), {
        status: resendRes.status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: resendData.id }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Internal error", detail: e.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});