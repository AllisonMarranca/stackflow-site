/**
 * GET /api/check?domain=example.com  ->  JSON score report
 */
import { analyzeDomain, normalizeDomain, json } from "./_engine.js";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const domain = normalizeDomain(url.searchParams.get("domain"));
  if (!domain) {
    return json({ error: "Please enter a valid domain, like yourbusiness.com" }, 400);
  }
  const result = await analyzeDomain(domain);
  return json(result);
}
