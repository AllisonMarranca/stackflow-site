/**
 * StackFlow AI Visibility Checker — STANDALONE WORKER (paste-ready)
 *
 * Use this until the GitHub auto-deploy pipeline is live. Setup (5 min):
 *  1. Cloudflare dashboard (allisonmarranca@gmail.com account) -> Workers & Pages
 *     -> Create -> Worker ("Start with Hello World") -> name it: stackflow-checker -> Deploy
 *  2. Click "Edit code", DELETE the sample code, paste THIS ENTIRE FILE, click Deploy.
 *  3. Back on the worker page -> Settings -> Domains & Routes -> Add -> Route:
 *        Route:  trystackflow.com/api/*      Zone: trystackflow.com
 *  4. Done. Test: https://trystackflow.com/api/check?domain=mainstreethost.com
 *
 * (Once GitHub auto-deploy is set up, the same engine ships as a Pages Function
 *  in functions/api/check.js and this worker can be deleted.)
 */

/**
 * StackFlow AI Visibility Checker — Cloudflare Pages Function
 * GET /api/check?domain=example.com  ->  JSON score report
 *
 * Checks (100 pts total):
 *  - Site reachable over HTTPS ............... 10
 *  - AI crawler access via robots.txt ........ 25  (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot)
 *  - Organization/LocalBusiness schema ....... 15
 *  - FAQ schema ............................... 5
 *  - sameAs entity links ...................... 5
 *  - llms.txt ................................ 10
 *  - Title tag ................................ 5
 *  - Meta description ......................... 5
 *  - H1 heading ............................... 5
 *  - Social preview (og:image) ................ 5
 *  - robots.txt present ....................... 5
 *  - sitemap.xml .............................. 5
 */

const AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot"];
const UA = "Mozilla/5.0 (compatible; StackFlowChecker/1.0; +https://trystackflow.com/ai-visibility-score/)";

async function handleCheck(request) {
  const reqUrl = new URL(request.url);
  let domain = (reqUrl.searchParams.get("domain") || "").trim().toLowerCase();

  // normalize input: allow full URLs, strip protocol/path/whitespace
  domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\s+/g, "");
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return json({ error: "Please enter a valid domain, like yourbusiness.com" }, 400);
  }

  const base = "https://" + domain;
  const [home, robots, llms, sitemap] = await Promise.all([
    grab(base + "/"),
    grab(base + "/robots.txt"),
    grab(base + "/llms.txt"),
    grab(base + "/sitemap.xml"),
  ]);

  const checks = [];
  const add = (id, label, ok, pts, max, detail, fix) =>
    checks.push({ id, label, status: ok === true ? "pass" : ok === "warn" ? "warn" : "fail", points: pts, max, detail, fix });

  // 1) Reachability
  if (!home.ok) {
    return json({
      domain,
      score: 0,
      grade: "Unreachable",
      summary: "We couldn't load " + domain + " over HTTPS. AI assistants can't recommend a site they can't reach.",
      checks: [{ id: "reach", label: "Site reachable over HTTPS", status: "fail", points: 0, max: 100, detail: home.err || "No response", fix: "Make sure the site loads at https://" + domain }],
    });
  }
  add("reach", "Site reachable over HTTPS", true, 10, 10, "Loaded in " + home.ms + "ms", "");

  const html = (home.body || "").slice(0, 400000);
  const htmlLower = html.toLowerCase();

  // 2) robots.txt + AI crawler access
  if (robots.ok && robots.body) {
    add("robots", "robots.txt present", true, 5, 5, "Found robots.txt", "");
    const blocked = blockedBots(robots.body);
    const open = AI_BOTS.filter((b) => !blocked.includes(b));
    const pts = Math.round((open.length / AI_BOTS.length) * 25);
    if (blocked.length === 0) {
      add("aibots", "AI crawlers allowed", true, 25, 25, "All major AI crawlers can read your site (" + AI_BOTS.join(", ") + ")", "");
    } else if (blocked.length < AI_BOTS.length) {
      add("aibots", "AI crawlers allowed", "warn", pts, 25, "Blocked: " + blocked.join(", ") + ". These AI engines can't read your site.", "Remove the Disallow rules for these bots in robots.txt (unless blocking them is a deliberate choice).");
    } else {
      add("aibots", "AI crawlers allowed", false, 0, 25, "All major AI crawlers are blocked in robots.txt — you're invisible to AI search.", "Remove the blanket Disallow rules for GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and CCBot.");
    }
  } else {
    add("robots", "robots.txt present", "warn", 2, 5, "No robots.txt found", "Add a robots.txt that welcomes AI crawlers and points to your sitemap.");
    add("aibots", "AI crawlers allowed", "warn", 18, 25, "No robots.txt means crawlers default to allowed — but you're not sending any signals.", "Add a robots.txt that explicitly allows AI crawlers.");
  }

  // 3) Structured data
  const hasLd = htmlLower.includes("application/ld+json");
  const hasOrg = hasLd && /"@type"\s*:\s*"?\[?[^\]"]*(organization|localbusiness|professionalservice|store|restaurant|medicalbusiness|legalservice|homeandconstructionbusiness)/i.test(html);
  const hasFaq = hasLd && /"@type"\s*:\s*"faqpage"/i.test(html);
  const hasSameAs = /"sameas"\s*:/i.test(html);

  add("org", "Business schema (Organization/LocalBusiness)", hasOrg, hasOrg ? 15 : 0, 15,
    hasOrg ? "Structured data tells AI engines exactly who you are." : hasLd ? "JSON-LD found, but no Organization or LocalBusiness entity." : "No structured data found.",
    hasOrg ? "" : "Add Organization or LocalBusiness JSON-LD with your name, address, and services.");
  add("faq", "FAQ schema", hasFaq, hasFaq ? 5 : 0, 5,
    hasFaq ? "FAQ content is easy for AI engines to quote." : "No FAQ schema — you're missing an easy way to become the answer.",
    hasFaq ? "" : "Add an FAQ section with FAQPage schema answering your customers' real questions.");
  add("sameas", "Entity links (sameAs)", hasSameAs, hasSameAs ? 5 : 0, 5,
    hasSameAs ? "Your profiles are linked, which builds entity trust." : "No sameAs links connecting your site to your social/business profiles.",
    hasSameAs ? "" : "Add sameAs links in your schema to Google Business Profile, LinkedIn, Facebook, etc.");

  // 4) llms.txt
  const llmsOk = llms.ok && (llms.body || "").trim().length > 20 && !(llms.body || "").trim().toLowerCase().startsWith("<!doctype") && !(llms.body || "").trim().toLowerCase().startsWith("<html");
  add("llms", "llms.txt", llmsOk, llmsOk ? 10 : 0, 10,
    llmsOk ? "You're telling AI engines exactly what to cite you for." : "No llms.txt — a fast-growing signal for AI answer engines.",
    llmsOk ? "" : "Add an llms.txt describing your business and key pages for AI engines.");

  // 5) Content basics
  const title = (html.match(/<title[^>]*>([^<]{1,300})/i) || [])[1];
  add("title", "Title tag", !!title, title ? 5 : 0, 5, title ? "“" + title.trim().slice(0, 80) + "”" : "No title tag found.", title ? "" : "Add a descriptive title tag naming what you do and where.");
  const desc = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html) || /<meta[^>]+content=["'][^"']{20,}["'][^>]+name=["']description["']/i.test(html);
  add("desc", "Meta description", desc, desc ? 5 : 0, 5, desc ? "Present." : "Missing or too short.", desc ? "" : "Add a 140–160 character description that answers what/where/who-for.");
  const h1 = /<h1[\s>]/i.test(html);
  add("h1", "H1 heading", h1, h1 ? 5 : 0, 5, h1 ? "Present." : "No H1 found.", h1 ? "" : "Add one clear H1 stating what your business does.");
  const og = /property=["']og:image["']/i.test(html);
  add("og", "Social preview image", og, og ? 5 : 0, 5, og ? "Present." : "No og:image — shared links look bare.", og ? "" : "Add og:image and og:title meta tags.");

  // 6) sitemap
  const smOk = sitemap.ok && ((sitemap.body || "").includes("<urlset") || (sitemap.body || "").includes("<sitemapindex"));
  add("sitemap", "sitemap.xml", smOk, smOk ? 5 : 0, 5, smOk ? "Found." : "No sitemap.xml found.", smOk ? "" : "Publish a sitemap.xml and reference it in robots.txt.");

  const score = Math.min(100, checks.reduce((s, c) => s + c.points, 0));
  const grade = score >= 80 ? "Strong" : score >= 60 ? "Good, with gaps" : score >= 40 ? "Needs work" : "Nearly invisible to AI";
  const fails = checks.filter((c) => c.status !== "pass").length;
  const summary =
    score >= 80
      ? domain + " has strong AI-visibility foundations. A review call can push you into the range where AI engines recommend you by name."
      : score >= 60
      ? domain + " has good bones, but " + fails + " gaps are holding it back from being cited by AI engines."
      : domain + " is missing several signals AI engines rely on — which usually means competitors are getting recommended instead.";

  return json({ domain, score, grade, summary, checkedAt: new Date().toISOString(), checks });
}

function blockedBots(robotsTxt) {
  const blocked = [];
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.trim());
  let currentAgents = [];
  let sawRuleForCurrent = false;
  const groups = [];
  for (const line of lines) {
    const ua = line.match(/^user-agent\s*:\s*(.+)$/i);
    const dis = line.match(/^disallow\s*:\s*(.*)$/i);
    if (ua) {
      if (sawRuleForCurrent) { currentAgents = []; sawRuleForCurrent = false; }
      currentAgents.push(ua[1].trim());
    } else if (dis && currentAgents.length) {
      sawRuleForCurrent = true;
      groups.push({ agents: [...currentAgents], path: dis[1].trim() });
    }
  }
  for (const bot of AI_BOTS) {
    const botGroups = groups.filter((g) => g.agents.some((a) => a.toLowerCase() === bot.toLowerCase()));
    if (botGroups.some((g) => g.path === "/")) blocked.push(bot);
  }
  return blocked;
}

async function grab(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,text/plain,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
    });
    const body = res.ok ? await res.text() : "";
    return { ok: res.ok, status: res.status, body, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, err: String(e && e.message ? e.message : e), ms: Date.now() - t0 };
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json;charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}


export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/check") return handleCheck(request);
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  },
};
