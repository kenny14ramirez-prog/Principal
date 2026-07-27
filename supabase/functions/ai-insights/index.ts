/**
 * Crozzo Edge Function: ai-insights
 * Actions: status | save_key | generate
 *
 * Secrets (supabase secrets set):
 *   NVIDIA_API_KEY=nvapi-...   (fallback platform-wide)
 *   SUPABASE_SERVICE_ROLE_KEY  (auto in hosted Edge)
 *   SUPABASE_URL               (auto)
 *
 * Per-business keys live in table crozzo_ai_secrets (service role only).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_MODEL = 'meta/llama-3.3-70b-instruct';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Max-Age': '86400',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function last4(key: string) {
  const k = String(key || '');
  return k.length >= 4 ? k.slice(-4) : '';
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function resolveNvidiaKey(businessId: string) {
  const sb = adminClient();
  if (sb && businessId) {
    try {
      const { data } = await sb
        .from('crozzo_ai_secrets')
        .select('api_key')
        .eq('business_id', businessId)
        .maybeSingle();
      if (data && data.api_key) return String(data.api_key);
    } catch (_) {
      /* table may not exist yet */
    }
  }
  return Deno.env.get('NVIDIA_API_KEY') || '';
}

async function statusAction(businessId: string) {
  const key = await resolveNvidiaKey(businessId);
  return json({
    configured: !!key && key.indexOf('nvapi-') === 0,
    last4: key ? last4(key) : '',
  });
}

async function saveKeyAction(businessId: string, apiKey: string) {
  const key = String(apiKey || '').trim();
  if (!businessId) return json({ error: 'business_id_required' }, 400);
  if (!key || key.indexOf('nvapi-') !== 0) return json({ error: 'invalid_key' }, 400);
  const sb = adminClient();
  if (!sb) return json({ error: 'service_role_missing' }, 500);
  const row = {
    business_id: businessId,
    api_key: key,
    last4: last4(key),
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from('crozzo_ai_secrets').upsert(row, { onConflict: 'business_id' });
  if (error) return json({ error: error.message || 'upsert_failed' }, 500);
  return json({ ok: true, last4: last4(key), configured: true });
}

function buildSystemPrompt() {
  return (
    'Eres analista operativo de un restaurante/café en Colombia. ' +
    'Recibes SOLO métricas agregadas (totales, horas, días). ' +
    'NO inventes números que no estén en el JSON. Si faltan datos, dilo. ' +
    'Responde en español colombiano, tono profesional y concreto. ' +
    'Estructura: (1) Diagnóstico breve (2) Picos y momentos muertos (3) Comparación vs periodo anterior (4) 3 acciones concretas. ' +
    'Máximo ~350 palabras. No es un arqueo fiscal.'
  );
}

async function generateAction(body: Record<string, unknown>) {
  const businessId = String(body.businessId || '').trim();
  const pack = body.pack;
  const range = body.range === 'month' ? 'month' : '8d';
  const model = String(body.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  if (!pack || typeof pack !== 'object') return json({ error: 'pack_required' }, 400);

  const nvidiaKey = await resolveNvidiaKey(businessId);
  if (!nvidiaKey || nvidiaKey.indexOf('nvapi-') !== 0) {
    return json({ error: 'key_not_configured' }, 400);
  }

  const sb = adminClient();
  if (sb && businessId) {
    try {
      const since = new Date(Date.now() - (range === 'month' ? 25 : 7) * 86400000).toISOString();
      const { data: recent } = await sb
        .from('crozzo_ai_insights')
        .select('id,created_at,range_kind')
        .eq('business_id', businessId)
        .eq('range_kind', range)
        .gte('created_at', since)
        .limit(1);
      if (recent && recent.length) {
        return json({ error: 'rate_limited', message: 'Ya hay una lectura reciente para este periodo.' }, 429);
      }
    } catch (_) {
      /* optional table */
    }
  }

  const userContent =
    'Genera la lectura del negocio para rango=' +
    range +
    '. JSON de métricas:\n' +
    JSON.stringify(pack);

  const nvRes = await fetch(NVIDIA_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + nvidiaKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userContent },
      ],
      temperature: 0.35,
      max_tokens: 900,
    }),
  });

  if (!nvRes.ok) {
    const errTxt = await nvRes.text().catch(() => '');
    return json({ error: 'nvidia_http_' + nvRes.status, detail: errTxt.slice(0, 400) }, 502);
  }
  const nvJson = await nvRes.json();
  const text = String(
    (nvJson &&
      nvJson.choices &&
      nvJson.choices[0] &&
      nvJson.choices[0].message &&
      nvJson.choices[0].message.content) ||
      ''
  ).trim();
  if (!text) return json({ error: 'empty_insight' }, 502);

  if (sb && businessId) {
    try {
      const cur = (pack as { current?: { from?: string; toExclusive?: string } }).current || {};
      await sb.from('crozzo_ai_insights').insert({
        business_id: businessId,
        range_kind: range,
        range_from: cur.from || null,
        range_to: cur.toExclusive || null,
        text: text,
        created_at: new Date().toISOString(),
      });
    } catch (_) {
      /* optional */
    }
  }

  return json({ ok: true, text: text, insight: text, model: model, range: range });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'invalid_json' }, 400);
  }

  const action = String(body.action || '').trim();
  const businessId = String(body.businessId || '').trim();

  try {
    if (action === 'status') return await statusAction(businessId);
    if (action === 'save_key') return await saveKeyAction(businessId, String(body.apiKey || ''));
    if (action === 'generate') return await generateAction(body);
    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
