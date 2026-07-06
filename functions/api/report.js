/**
 * POST /api/report  ->  emails the AI Visibility Report to the requester
 * Body: { name, email, domain, newsletter: boolean }
 *
 * Requires env RESEND_API_KEY (set in the Cloudflare Pages project:
 * stackflow-landing -> Settings -> Variables and Secrets -> Secret).
 * Sending domain (reports@trystackflow.com) must be verified in Resend.
 *
 * Compliance notes:
 *  - The report email is transactional (explicitly requested by the visitor).
 *  - `newsletter` is a separate, unchecked-by-default marketing opt-in; it is
 *    only recorded (flagged in the lead notification) — no automated marketing
 *    sends happen from here.
 */
import { analyzeDomain, normalizeDomain, json } from "./_engine.js";

const FROM_REPORTS = "StackFlow Reports <reports@trystackflow.com>";
const LEAD_INBOX = "hello@trystackflow.com";
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

  // 2) Lead notification to StackFlow (failure here shouldn't fail the request)
  try {
    await resend(env.RESEND_API_KEY, {
      from: FROM_REPORTS,
      to: [LEAD_INBOX],
      subject: "New checker lead: " + name + " — " + result.domain + " (" + result.score + "/100)" + (newsletter ? " [newsletter opt-in]" : ""),
      html: leadHtml(name, email, newsletter, result),
    });
  } catch (e) { /* lead copy failed; report already delivered */ }

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
  if (status === "pass") return { mark: "&#9989;", color: "#26D07C", word: "Pass" };
  if (status === "warn") return { mark: "&#9888;&#65039;", color: "#F59E0B", word: "Attention" };
  return { mark: "&#10060;", color: "#F87171", word: "Missing" };
}

function reportHtml(name, r) {
  const scoreColor = r.score >= 80 ? "#26D07C" : r.score >= 60 ? "#00BFB3" : r.score >= 40 ? "#F59E0B" : "#F87171";
  const rows = (r.checks || []).map(function (c) {
    const b = statusBits(c.status);
    return '<tr>' +
      '<td style="padding:12px 14px;border-bottom:1px solid #1E293B;vertical-align:top;white-space:nowrap">' + b.mark + '</td>' +
      '<td style="padding:12px 14px 12px 0;border-bottom:1px solid #1E293B;vertical-align:top">' +
        '<div style="color:#FFFFFF;font-weight:700;font-size:14px">' + esc(c.label) +
        ' <span style="color:#64748B;font-weight:400;font-size:12px">&nbsp;' + c.points + "/" + c.max + '</span></div>' +
        '<div style="color:#94A3B8;font-size:13px;line-height:1.5;margin-top:2px">' + esc(c.detail) + '</div>' +
        (c.fix ? '<div style="color:#2DD4BF;font-size:13px;line-height:1.5;margin-top:4px"><b>Fix:</b> ' + esc(c.fix) + '</div>' : "") +
      '</td></tr>';
  }).join("");

  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0B1120">' +
  '<div style="max-width:600px;margin:0 auto;padding:32px 20px;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="font-size:22px;font-weight:800;color:#FFFFFF;margin-bottom:24px">Stack<span style="color:#00BFB3">Flow</span></div>' +
    '<div style="background:#0F172A;border:1px solid #243449;border-radius:14px;padding:28px">' +
      '<p style="color:#E2E8F0;font-size:15px;margin:0 0 6px">Hi ' + esc(name) + ",</p>" +
      '<p style="color:#94A3B8;font-size:14px;line-height:1.6;margin:0 0 22px">Here\'s the AI Visibility Report you requested for <b style="color:#E2E8F0">' + esc(r.domain) + "</b>.</p>" +
      '<div style="text-align:center;padding:18px 0 24px">' +
        '<div style="font-size:56px;font-weight:800;color:' + scoreColor + ';line-height:1">' + r.score + '</div>' +
        '<div style="color:#94A3B8;font-size:13px;margin-top:4px">out of 100 &middot; ' + esc(r.grade) + '</div>' +
      '</div>' +
      '<p style="color:#94A3B8;font-size:14px;line-height:1.6;margin:0 0 20px">' + esc(r.summary) + '</p>' +
      '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">' + rows + '</table>' +
      '<div style="text-align:center;margin-top:28px">' +
        '<a href="' + BOOKING_URL + '" style="display:inline-block;background:#00BFB3;color:#00151f;font-weight:700;font-size:15px;padding:14px 26px;border-radius:10px;text-decoration:none">Book a Free 15-Minute Results Review</a>' +
        '<div style="color:#64748B;font-size:12px;margin-top:10px">We\'ll walk through this report together and pinpoint the three fixes that matter most.</div>' +
      '</div>' +
    '</div>' +
    '<div style="color:#64748B;font-size:11px;line-height:1.6;margin-top:20px;text-align:center">' +
      'You received this one-time report because you requested it at ' +
      '<a href="https://trystackflow.com/ai-visibility-score/" style="color:#94A3B8">trystackflow.com</a>. ' +
      'We won\'t email you again unless you opted into tips or contact us at ' +
      '<a href="mailto:hello@trystackflow.com" style="color:#94A3B8">hello@trystackflow.com</a>.<br>' +
      'StackFlow &middot; The AI Visibility Platform &middot; in partnership with Mainstreethost &middot; ' +
      '<a href="https://trystackflow.com/privacy/" style="color:#94A3B8">Privacy Policy</a>' +
    '</div>' +
  '</div></body></html>';
}

function leadHtml(name, email, newsletter, r) {
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
    '<p>Full report was emailed to the lead. <a href="https://trystackflow.com/api/check?domain=' + encodeURIComponent(r.domain) + '">Re-run their check</a>.</p>' +
    "</div>";
}
