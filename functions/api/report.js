/**
 * POST /api/report  ->  emails the AI Visibility Report to the requester
 * Body: { name, email, domain, newsletter: boolean }
 *
 * Requires env RESEND_API_KEY (set in the Cloudflare Pages project:
 * stackflow-landing -> Settings -> Variables and Secrets -> Secret).
 * Sending domain (reports@straightgrade.com) must be verified in Resend.
 *
 * Compliance notes:
 *  - The report email is transactional (explicitly requested by the visitor).
 *  - `newsletter` is a separate, unchecked-by-default marketing opt-in; it is
 *    only recorded (flagged in the lead notification) — no automated marketing
 *    sends happen from here.
 */
import { analyzeDomain, normalizeDomain, json } from "./_engine.js";

const FROM_REPORTS = "StraightGrade Reports <reports@straightgrade.com>";
const LEAD_INBOX = "hello@straightgrade.com";
const BOOKING_URL = "https://calendly.com/getstackflow/ai-visibility-results-review";

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid request." }, 400); }

  const name = String(body.name || "").trim().slice(0, 100);
  const email = String(body.email || "").trim().slice(0, 200);
  const domain = normalizeDomain(body.domain);
  const newsletter = body.newsletter === true;
  const source = (body.source && typeof body.source === "object") ? body.source : {};

  if (!name) return json({ error: "Please tell us your first name." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "Please enter a valid email address." }, 400);
  if (!domain) return json({ error: "We couldn't read the website to report on — please re-run your check." }, 400);

  if (!env.RESEND_API_KEY) {
    return json({ error: "Email delivery isn't switched on yet. Book a free results review instead and we'll walk through everything live." }, 503);
  }

  const result = await analyzeDomain(domain);
  if (result.error) return json({ error: result.error }, 400);

  // 1) The requested report, to the visitor
  const sent = await resend(env.RESEND_API_KEY, {
    from: FROM_REPORTS,
    to: [email],
    subject: "Your AI Visibility Report — " + result.domain + " scored " + result.score + "/100",
    html: reportHtml(name, result),
  });
  if (!sent.ok) {
    return json({ error: "We couldn't send the email just now — please try again in a minute, or book a free review instead." }, 502);
  }

  // 2) Lead notification to StraightGrade (failure here shouldn't fail the request)
  try {
    await resend(env.RESEND_API_KEY, {
      from: FROM_REPORTS,
      to: [LEAD_INBOX],
      subject: "New checker lead: " + name + " — " + result.domain + " (" + result.score + "/100)" + (newsletter ? " [newsletter opt-in]" : ""),
      html: leadHtml(name, email, newsletter, result, source),
    });
  } catch (e) { /* lead copy failed; report already delivered */ }

  // 3) Optional lead log (create a KV namespace bound as LEADS on the Pages
  //    project to activate; silently skipped otherwise)
  try {
    if (env.LEADS) {
      await env.LEADS.put(
        "lead:" + Date.now() + ":" + email,
        JSON.stringify({ name: name, email: email, domain: result.domain, score: result.score, newsletter: newsletter, source: source, at: new Date().toISOString() })
      );
    }
  } catch (e) { /* logging is best-effort */ }

  return json({ ok: true });
}

async function resend(key, payload) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, err: String(e) };
  }
}

function esc(t) {
  return String(t == null ? "" : t)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function statusBits(status) {
  if (status === "pass") return { mark: "&#10003;", color: "#149A5B", word: "Pass" };
  if (status === "warn") return { mark: "!", color: "#B45309", word: "Attention" };
  return { mark: "&#10005;", color: "#DC2626", word: "Missing" };
}

function reportHtml(name, r) {
  const scoreColor = r.score >= 80 ? "#149A5B" : r.score >= 60 ? "#0B8F84" : r.score >= 40 ? "#B45309" : "#DC2626";
  const rows = (r.checks || []).map(function (c) {
    const b = statusBits(c.status);
    return '<tr>' +
      '<td width="34" style="padding:14px 0;border-bottom:1px solid #EDF1F7;vertical-align:top;text-align:center;' +
        'font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:' + b.color + '">' + b.mark + '</td>' +
      '<td style="padding:14px 0 14px 4px;border-bottom:1px solid #EDF1F7;vertical-align:top;font-family:Arial,Helvetica,sans-serif">' +
        '<div style="color:#132032;font-weight:700;font-size:14px">' + esc(c.label) +
        ' <span style="color:#8393A9;font-weight:400;font-size:12px">&nbsp;' + c.points + "/" + c.max + '</span></div>' +
        '<div style="color:#5A6A82;font-size:13px;line-height:1.5;margin-top:3px">' + esc(c.detail) + '</div>' +
        (c.fix ? '<div style="color:#0B8F84;font-size:13px;line-height:1.5;margin-top:4px"><b>Fix:</b> ' + esc(c.fix) + '</div>' : "") +
      '</td></tr>';
  }).join("");

  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F0F4F8">' +
  '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F0F4F8"><tr><td align="center" style="padding:28px 14px">' +
  '<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%">' +

    // wordmark
    '<tr><td style="padding:0 4px 16px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:#132032">' +
      'Str<span style="color:#00BFB3">ai</span>ght<span style="color:#00BFB3">Grade</span></td></tr>' +

    // card
    '<tr><td>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#FFFFFF;border:1px solid #E3E9F1;border-radius:14px">' +
      '<tr><td height="5" style="background:#00BFB3;border-radius:14px 14px 0 0;font-size:0;line-height:0">&nbsp;</td></tr>' +
      '<tr><td style="padding:28px 30px 30px;font-family:Arial,Helvetica,sans-serif">' +

        '<p style="color:#132032;font-size:15px;margin:0 0 6px">Hi ' + esc(name) + ",</p>" +
        '<p style="color:#5A6A82;font-size:14px;line-height:1.6;margin:0 0 8px">Here\'s the AI Visibility Report you requested for <b style="color:#132032">' + esc(r.domain) + "</b>.</p>" +

        // score
        '<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding:22px 0 26px;font-family:Arial,Helvetica,sans-serif">' +
          '<div style="font-size:62px;font-weight:800;color:' + scoreColor + ';line-height:1">' + r.score + '</div>' +
          '<div style="color:#8393A9;font-size:13px;margin-top:6px">out of 100 &middot; <b style="color:#132032">' + esc(r.grade) + '</b></div>' +
          '<div style="color:#5A6A82;font-size:14px;line-height:1.6;margin-top:14px;max-width:440px">' + esc(r.summary) + '</div>' +
        '</td></tr></table>' +

        // checks
        '<div style="color:#8393A9;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:6px 0 2px;border-bottom:2px solid #E3E9F1">Your 12-signal scan</div>' +
        '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">' + rows + '</table>' +

        // CTA
        '<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding:30px 0 0;font-family:Arial,Helvetica,sans-serif">' +
          '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
            '<td style="background:#00BFB3;border-radius:10px">' +
              '<a href="' + BOOKING_URL + '" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;color:#FFFFFF;font-weight:700;font-size:15px;padding:14px 28px;text-decoration:none">Book a Free 15-Minute Results Review</a>' +
            '</td></tr></table>' +
          '<div style="color:#8393A9;font-size:12.5px;line-height:1.6;margin-top:12px;max-width:400px">We\'ll walk through this report together and pinpoint the three fixes that matter most.</div>' +
          '<div style="color:#5A6A82;font-size:13px;line-height:1.6;margin-top:18px;padding-top:16px;border-top:1px solid #EDF1F7">Want the deep version? The <a href="https://straightgrade.com/pro-report/" style="color:#0B8F84;font-weight:700">AI Visibility Audit</a> tests who AI actually recommends in your market, compares you to competitors, and includes a 30-day fix plan &mdash; $29.</div>' +
        '</td></tr></table>' +

      '</td></tr>' +
    '</table>' +
    '</td></tr>' +

    // footer
    '<tr><td style="color:#8393A9;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.7;padding:18px 10px 0;text-align:center">' +
      'You received this one-time report because you requested it at ' +
      '<a href="https://straightgrade.com/ai-visibility-score/" style="color:#5A6A82">straightgrade.com</a>. ' +
      'We won\'t email you again unless you opted into tips or contact us at ' +
      '<a href="mailto:hello@straightgrade.com" style="color:#5A6A82">hello@straightgrade.com</a>.<br>' +
      'StraightGrade &middot; The AI Visibility Platform &middot; ' +
      '<a href="https://straightgrade.com/privacy/" style="color:#5A6A82">Privacy Policy</a>' +
    '</td></tr>' +

  '</table></td></tr></table></body></html>';
}

function leadHtml(name, email, newsletter, r, source) {
  const srcPairs = Object.keys(source || {}).map(function (k) {
    return esc(k) + ": " + esc(String(source[k]).slice(0, 200));
  }).join("<br>") || "direct / unknown";
  const fails = (r.checks || []).filter(function (c) { return c.status !== "pass"; })
    .map(function (c) { return esc(c.label); }).join(", ") || "none";
  return '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7">' +
    "<h2>New AI Visibility Checker lead</h2>" +
    "<p><b>Name:</b> " + esc(name) + "<br>" +
    "<b>Email:</b> " + esc(email) + "<br>" +
    "<b>Website:</b> " + esc(r.domain) + "<br>" +
    "<b>Score:</b> " + r.score + "/100 (" + esc(r.grade) + ")<br>" +
    "<b>Gaps:</b> " + fails + "<br>" +
    "<b>Newsletter opt-in:</b> " + (newsletter ? "YES — add to tips list" : "no") + "</p>" +
    "<p><b>Lead source:</b><br>" + srcPairs + "</p>" +
    '<p>Full report was emailed to the lead. <a href="https://straightgrade.com/api/check?domain=' + encodeURIComponent(r.domain) + '">Re-run their check</a>.</p>' +
    "</div>";
}
