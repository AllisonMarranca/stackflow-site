# StackFlow — AI Growth Platform for Small Businesses

The trystackflow.com website. Static, multi-page HTML — no framework and no build step.
Repositioned from an AI-tools affiliate landing page into a broader AI growth platform,
while preserving the existing affiliate strategy (tools are now framed as recommended
picks inside a larger customer journey).

## Structure

```
stackflow-site/
  index.html                     Homepage (Hero, Why StackFlow, Choose Your Starting Point,
                                 Recommended AI Stack, How It Works, Customer Outcomes,
                                 Latest Resources, Final CTA)
  ai-growth-blueprint/index.html Personalized strategy page + request form
  ai-visibility-score/index.html AI search readiness page + form (ChatGPT, Google AI
                                 Overviews, Gemini, Claude, Perplexity)
  ai-tools/index.html            Affiliate recommendations organized by 10 business needs
                                 (Writing, SEO, Automation, Video, Meetings, Customer
                                 Support, Analytics, CRM, Design, Email)
  automation-library/index.html  Ready-to-use workflows (preview) + notify form
  resources/index.html           Guides, playbooks, comparisons + newsletter
  about/index.html               Mission + what we offer
  contact/index.html             Contact info + message form
  assets/css/main.css            Shared design system (dark modern SaaS)
  assets/js/main.js              Mobile nav toggle + affiliate/CTA click tracking + demo forms
```

## Conventions

- **Root-absolute paths** (`/ai-tools/`, `/assets/css/main.css`). The site must be served
  from the domain root (as trystackflow.com is). Clean URLs use folder/`index.html`.
- **Shared header/footer** are duplicated on each page (no templating). If you change the
  nav or footer, update every page. The `class="active"` marker highlights the current page.

## Affiliate links

- **GoHighLevel** uses the live affiliate URL preserved from the original site:
  `https://www.gohighlevel.com/pro-trial?fp_ref=t9gncf` (in `ai-tools/index.html`, CRM section).
- **Jasper, Surfer SEO, Pictory, Make.com, ElevenLabs** are `href="#"` placeholders (as in the
  original) with `rel="sponsored noopener"` and `data-cta` tracking hooks. Replace each `#`
  with your tracked affiliate URL. Search the file for `Affiliate link: replace href`.
- Newer picks (Fathom, Otter.ai, Tidio, Plausible, Canva, MailerLite) link to official sites
  with `rel="noopener"`. Swap in affiliate URLs and change `rel` to `sponsored noopener` if you
  join those programs.
- CTA/affiliate clicks fire through `[data-cta]` in `assets/js/main.js` — replace the
  `console.log` with your analytics call (Plausible / GA4 / PostHog).

## Forms

All forms are front-end previews (`data-demo`) with no backend. Connect each to your email
platform or CRM (e.g. via a form action URL or embedded provider) before launch.

## Deploy

Upload the entire `stackflow-site/` folder contents to the web root of trystackflow.com
(or push to your static host / GitHub Pages). Because paths are root-absolute, serve from
the domain root, not a subfolder.

## Rollback

The previous single-page site is preserved unchanged at
`../StackFlow_AI_Top_Tools_Landing_Page.html` (identical to `../stackflow-landing-v2.zip`).

## Brand assets (July 2026)

Logo system lives in `assets/brand/` — primary mark is the **teal diagonal layers** (Concept 1),
social/app badge is the **SF monogram** (Concept 4, teal rounded square).

- `icon.svg` / `icon-{40,400,1000}.png` — primary mark, transparent (plus white/dark one-color variants)
- `badge.svg` / `badge-512.png` / `avatar-1024.png` — SF badge for TikTok/IG/app icons
- `wordmark.svg` + `wordmark-onDark.png` / `wordmark-onLight.png` — full lockup ("Stack" + teal "Flow", Montserrat ExtraBold)
- `/favicon.ico` (16/32/48), `/favicon.svg`, `/apple-touch-icon.png` — linked in every page head
- `/assets/logo.png` (512², referenced by Organization schema) and `/assets/og-image.png` (1200×630, referenced by OG/Twitter meta)
- `fonts/` — Montserrat-ExtraBold + Lato-Regular TTFs used to render the PNGs

Brand naming: the wordmark is **StackFlow** (no "AI" suffix); the tagline carries the positioning.
All assets are mirrored into the WordPress theme at `stackflow-wordpress/stackflow/assets/`.
