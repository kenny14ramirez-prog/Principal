/**
 * CrozzoEmailTemplates — Plantillas de email profesionales para BONA origen.
 *
 * Plantillas HTML con branding de BONA origen.
 * Se usan para verificación de correo y recuperación de PIN.
 */
(function (global) {
  'use strict';

  var BRAND_COLOR = '#1a1a2e';
  var ACCENT_COLOR = '#2ecc71';
  var BG_COLOR = '#f8f9fa';

  // ── Plantilla base ──────────────────────────────────────────────
  function baseTemplate(title, content) {
    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BG_COLOR};font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG_COLOR};padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.08);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:${BRAND_COLOR};padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:1.5rem;font-weight:700;letter-spacing:1px;">BONA origen</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:0.8rem;">Sistema POS</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f1f3f5;padding:16px 32px;text-align:center;border-top:1px solid #e9ecef;">
              <p style="margin:0;color:#868e96;font-size:0.75rem;">
                © ${new Date().getFullYear()} BONA origen · Sistema POS<br>
                Este correo fue enviado automáticamente. No respondas a este mensaje.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  // ── Plantilla de verificación de correo ─────────────────────────
  function templateVerificacion(email, code) {
    var content =
      '<h2 style="margin:0 0 16px;color:' + BRAND_COLOR + ';font-size:1.2rem;">Verifica tu correo electrónico</h2>' +
      '<p style="margin:0 0 16px;color:#495057;font-size:0.95rem;line-height:1.6;">' +
        'Hola,<br><br>' +
        'Recibimos una solicitud para verificar tu correo electrónico asociado a tu cuenta de Super Admin en BONA origen.' +
      '</p>' +
      '<div style="background:' + BG_COLOR + ';border-radius:12px;padding:20px;text-align:center;margin:20px 0;">' +
        '<p style="margin:0 0 8px;color:#868e96;font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;">Tu código de verificación</p>' +
        '<p style="margin:0;color:' + BRAND_COLOR + ';font-size:2rem;font-weight:700;letter-spacing:8px;font-family:monospace;">' + code + '</p>' +
      '</div>' +
      '<p style="margin:0 0 16px;color:#868e96;font-size:0.8rem;">' +
        'Este código expira en <strong>10 minutos</strong>.<br>' +
        'Si no solicitaste este código, ignora este mensaje. Tu cuenta está segura.' +
      '</p>';

    return baseTemplate('Verifica tu correo — BONA origen', content);
  }

  // ── Plantilla de recuperación de PIN ────────────────────────────
  function templateRecuperacion(email, code) {
    var content =
      '<h2 style="margin:0 0 16px;color:' + BRAND_COLOR + ';font-size:1.2rem;">Recuperación de PIN</h2>' +
      '<p style="margin:0 0 16px;color:#495057;font-size:0.95rem;line-height:1.6;">' +
        'Hola,<br><br>' +
        'Recibimos una solicitud para cambiar el PIN de tu cuenta de Super Admin en BONA origen.' +
      '</p>' +
      '<div style="background:' + BG_COLOR + ';border-radius:12px;padding:20px;text-align:center;margin:20px 0;">' +
        '<p style="margin:0 0 8px;color:#868e96;font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;">Tu código de recuperación</p>' +
        '<p style="margin:0;color:#e74c3c;font-size:2rem;font-weight:700;letter-spacing:8px;font-family:monospace;">' + code + '</p>' +
      '</div>' +
      '<p style="margin:0 0 16px;color:#868e96;font-size:0.8rem;">' +
        'Este código expira en <strong>10 minutos</strong>.<br>' +
        'Si no solicitaste este cambio, tu cuenta está segura — simplemente ignora este mensaje.' +
      '</p>' +
      '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin-top:16px;">' +
        '<p style="margin:0;color:#856404;font-size:0.8rem;">' +
          '⚠️ <strong>Importante:</strong> Nunca compartas este código con nadie. El equipo de BONA origen nunca te pedirá este código por teléfono o chat.' +
        '</p>' +
      '</div>';

    return baseTemplate('Recuperación de PIN — BONA origen', content);
  }

  // ── Plantilla de bienvenida ──────────────────────────────────────
  function templateBienvenida(email, nombre) {
    var content =
      '<h2 style="margin:0 0 16px;color:' + BRAND_COLOR + ';font-size:1.2rem;">Bienvenido a BONA origen</h2>' +
      '<p style="margin:0 0 16px;color:#495057;font-size:0.95rem;line-height:1.6;">' +
        'Hola ' + (nombre || 'Super Admin') + ',<br><br>' +
        'Tu correo electrónico ha sido verificado correctamente. Ahora puedes usarlo para recuperar tu PIN si lo olvidas.' +
      '</p>' +
      '<div style="background:' + BG_COLOR + ';border-radius:12px;padding:20px;text-align:center;margin:20px 0;">' +
        '<p style="margin:0;color:' + ACCENT_COLOR + ';font-size:1.1rem;font-weight:600;">✅ Correo verificado</p>' +
        '<p style="margin:4px 0 0;color:#868e96;font-size:0.85rem;">' + email + '</p>' +
      '</div>';

    return baseTemplate('Bienvenido — BONA origen', content);
  }

  // ── Enviar email via Edge Function ──────────────────────────────
  async function enviarEmail(to, subject, html) {
    try {
      var res = await fetch('https://hogeggkkodkpzossjfft.supabase.co/functions/v1/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer sb_publishable_rNiFFu5h4YR-Ab5n8wxJSA_G58xhE64',
        },
        body: JSON.stringify({ to: to, subject: subject, html: html }),
      });

      if (!res.ok) {
        var err = await res.text();
        return { ok: false, error: 'send_failed', detail: err };
      }

      var data = await res.json();
      return { ok: true, id: data.id };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── API pública ─────────────────────────────────────────────────
  global.CrozzoEmailTemplates = {
    templateVerificacion: templateVerificacion,
    templateRecuperacion: templateRecuperacion,
    templateBienvenida: templateBienvenida,
    enviarEmail: enviarEmail,
  };

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));