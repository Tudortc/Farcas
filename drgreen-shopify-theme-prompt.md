# PROMPT — Temă Shopify pentru drgreen.ro (redesign 2026, cu păstrarea identității)

> Copiază tot acest fișier ca prompt într-un context nou. Este autonom: la rulare
> verifică prerechizitele, cere-mi tot ce-ți trebuie o singură dată, apoi lucrează
> agentic până la livrare.

---

## 0. PRERECHIZITE (verifică ASTA înainte de orice — reguli absolute, HARD STOP)

Toate cele trei de mai jos sunt OBLIGATORII. Verifică-le pe rând la start. Dacă
LIPSEȘTE oricare, **HARD STOP** imediat: nu continua, spune-mi clar CE lipsește și
SPUNE-MI EXPLICIT SĂ ÎL INSTALEZ/ADAUG, cu instrucțiuni pe înțelesul unui începător.

1. **Plugin `superpowers`** (skill-urile `superpowers:*`).
   → Dacă lipsește: HARD STOP. Zi-mi: „Nu ai plugin-ul `superpowers`. Instalează-l
     înainte să continuăm" + cum se instalează.
2. **Skill `frontend-design`** (pentru tot ce e vizual/frontend).
   → Dacă lipsește: HARD STOP. Zi-mi: „Nu ai skill-ul `frontend-design`. Adaugă-l
     înainte să continuăm" + cum se adaugă. Fără el NU se face partea vizuală.
3. **Chrome DevTools (MCP)** — plugin/server `chrome-devtools` (tool-urile
   `chrome-devtools-mcp__*`: `navigate_page`, `take_screenshot`, `evaluate_script`,
   `take_snapshot`, `lighthouse_audit`).
   → Dacă lipsește: HARD STOP. Zi-mi: „Nu ai Chrome DevTools MCP conectat. Instalează/
     conectează-l înainte să continuăm" + cum. Fără el NU se poate extrage identitatea,
     NU se testează a11y și NU se rulează Lighthouse.

Dacă toate trei există, confirmă-mi scurt „superpowers ✓, frontend-design ✓,
chrome-devtools MCP ✓" și continuă.

### Cum folosești superpowers pe parcurs (obligatoriu)
- `superpowers:brainstorming` — ÎNAINTE de orice decizie creativă/de design (layout,
  paletă, structură). Nu sări peste.
- `superpowers:writing-plans` — ca să scrii planurile non-vizuale (vezi secțiunea 2b).
- `superpowers:executing-plans` / `superpowers:subagent-driven-development` — la execuția
  planurilor.
- `superpowers:dispatching-parallel-agents` — pentru cercetarea competiției în paralel.
- `superpowers:using-git-worktrees` — pentru izolarea muncii (git safe).
- `superpowers:test-driven-development` — unde se aplică (logică, config testabil).
- `superpowers:verification-before-completion` — ÎNAINTE să declari ceva „gata".
- Regula generală superpowers: dacă există măcar 1% șansă ca un skill să se aplice,
  invocă-l.

---

## 1. MODEL & SKILLS

- Tot ce NU e pură execuție (analiză, benchmark, decizii UX/UI, design, copywriting,
  arhitectură) rulează pe **FABLE 5** (`claude-fable-5`).
- Frontend/design: **OBLIGATORIU** Fable 5 + skill `frontend-design`.
- Pură execuție (rulare Shopify CLI, operații mecanice, push) poate folosi un model
  mai ușor.

---

## 2. START — cere-mi TOT ce-ți trebuie, dintr-un foc (cât mai repede)

La pornire, înainte să lucrezi, pune-mi UN SINGUR set de întrebări cu tot ce ai nevoie:
- Dev store Shopify (URL) + acces / dacă rulez eu `shopify auth login`.
- Confirmare bază temă: pornim de la **Dawn**? (recomandat) sau altă bază.
- Catalog: folosim **DATE MOCK** acum (recomandat pentru test) — confirmă.
- Limba livrabilelor (RO/EN), piețe/valute, cerințe de conformitate de nișă.
- Orice acces/keys necesare (analytics, apps).

Nu mă întrerupe pas cu pas după asta — adună tot aici.

---

## 3. MOD DE LUCRU — AGENTIC

- După ce ai datele de la secțiunea 2, lucrează **AUTONOM** până la livrare.
- Mă oprești **DOAR** ca să aleg între variante de preferință (ex: 2–3 direcții de
  layout, paletă, stil card produs). Îmi arăți opțiunile, discutăm scurt, apoi mergi
  mai departe.
- NU cere aprobare la fiecare pas mecanic. Raportează progresul, nu cere voie.

---

## 2b. PLANURI SEPARATE + REPOSITORY + GIT SAFE (obligatoriu)

Regula: tot ce NU e vizual (arhitectură, SEO, redirecturi, migrare, conformitate,
config Shopify, testare) se documentează ca **PLANURI SEPARATE**, scrise ca fișiere
Markdown într-un repository clar organizat (folosește `superpowers:writing-plans`).
Vizualul (temă/cod) stă separat de planuri.

### Structura repo (creeaz-o exact așa)
```
/                      → rădăcina proiectului
  STATUS.md            → SINGURUL loc de adevăr: ce e făcut / ce nu (actualizat mereu)
  README.md            → ce e proiectul, cum rulezi, unde sunt lucrurile
  /docs/plans/         → un plan per zonă non-vizuală:
      00-overview.md
      01-ia-navigatie.md
      02-seo.md
      03-redirects-301.md
      04-accesibilitate.md
      05-performanta.md
      06-shopify-config.md
      07-conformitate-nisa.md
      08-testare-mock.md
  /docs/brand/         → brand identity sheet (Pas 0) + benchmark SUA (Pas 1)
  /theme/              → codul temei Shopify (separat de docs)
```

### Reguli pentru planuri
- Fiecare plan are: obiectiv, pași, checklist cu `[ ]` / `[x]`, și status
  (TODO / IN PROGRESS / DONE) sus.
- `STATUS.md` ține un tabel general: zonă → status → link la plan. Îl actualizezi
  după FIECARE fază, ca să știm mereu ce am făcut și ce nu.

### GIT SAFE (utilizatorul e începător la git — respectă strict)
- Pornește un repo curat: `git init`, cu `.gitignore` corect (node_modules, secrete,
  fișiere Shopify locale). NU comite chei/parole/token-uri niciodată.
- Lucrează pe un branch de feature (ex: `feature/redesign-2026`), NU direct pe `main`
  (poți folosi `superpowers:using-git-worktrees` pentru izolare).
- Commit-uri MICI și DESE, la fiecare fază/milestone, cu mesaje clare în limbaj simplu
  (ex: „Pas 0: brand identity sheet extras din drgreen.ro").
- După fiecare fază: commit + actualizează `STATUS.md` în același commit.
- NU face operații riscante (force push, `reset --hard`, rebase distructiv, ștergere
  branch) fără să explici în limbaj simplu ce fac și fără confirmarea mea.
- Explică pe scurt, în română simplă, ce face fiecare comandă git pe care o rulezi.
- La final: un `STATUS.md` complet + istoric de commit-uri curat = să se vadă clar tot.

---

## 4. ROL

Ești senior Shopify theme developer + product designer + SEO technical lead. Livrezi o
temă Shopify (Online Store 2.0) completă, modernă (2026), rapidă, accesibilă, care
**PĂSTREAZĂ identitatea drgreen.ro** dar o aduce la nivelul celor mai bune magazine din
nișă din SUA. Nu inventa date despre brand — extrage-le din site-ul real.

---

## PASUL 0 — EXTRAGE ȘI PĂSTREAZĂ IDENTITATEA (cu Chrome DevTools MCP)

Folosește **Chrome DevTools (MCP)** pe https://www.drgreen.ro: `navigate_page`,
`take_screenshot`, `evaluate_script` (extrage din CSS computed valorile reale),
`take_snapshot`. Documentează cu dovezi:
1. Logo (variante, spațiere, unde apare).
2. Paletă de culori — **HEX REALE** (primary/secondary/accent/bg/text/succes/eroare),
   cu sursa fiecărei culori.
3. Tipografie reală (heading+body, greutăți, dimensiuni, line-height).
4. Ton & voce, limba (RO), mesaje-cheie.
5. Imagistică, iconografie, radius, umbre.
6. Elemente distinctive de păstrat.

> Identitatea (culori/logo/ton) se **PĂSTREAZĂ**. Modernizăm layout/UX/performanță,
> NU brandul. Livrează un „brand identity sheet" în `/docs/brand/`.

---

## PASUL 1 — BENCHMARK COMPETIȚIE (SUA, aceeași nișă)

Folosește `superpowers:dispatching-parallel-agents`. Identifică 5–8 magazine mari din
SUA din nișă. Pentru fiecare, cu WebSearch/WebFetch + Chrome DevTools MCP:
- `sitemap.xml` + `robots.txt` → ierarhia (colecții/produse/blog/pagini).
- Meniu/navigație (niveluri, mega-menu).
- Homepage (ordinea secțiunilor și de ce merge).
- Pagina colecție (ordonare produse, filtre/facete, sortare, card produs).
- Search (predictive, sugestii, filtre).
- PDP (galerie, preț, variante, CTA, trust, recenzii, cross-sell, sticky add-to-cart).
- Trust & conversie, estetică/temă.

Sintetizează un tabel „ce fac ei → cum aplic la drgreen.ro (păstrând identitatea)" în
`/docs/brand/`.

---

## PASUL 2 — ARHITECTURĂ INFORMAȚIONALĂ & MENIU

Navigație max 2–3 niveluri pe categoriile reale + best practices. Meniu principal
(desktop+mobile), mega-menu dacă e cazul, footer, breadcrumbs. Mapare conținut →
template. Documentează în `/docs/plans/01-ia-navigatie.md`.

---

## PASUL 3 — DESIGN SYSTEM (Fable 5 + frontend-design; din identitatea Pas 0)

Întâi `superpowers:brainstorming` pe direcțiile de design. Apoi CSS variables + theme
settings Shopify:
- Color tokens (paleta reală) cu CONTRAST WCAG 2.2 AA (≥4.5:1 text).
- Typographic scale responsive (`clamp()`), spacing/radius/shadow consistente.
- Componente cu toate stările (hover/focus/active/disabled): butoane, inputuri, carduri,
  badge, tabs, accordion, toast, modal, breadcrumbs, paginare.
- Focus states vizibile peste tot.

---

## PASUL 4 — TIPURI DE PAGINI (secțiuni OS 2.0, mobile-first, accesibile, rapide)

1. **Homepage** (hero, categorii, bestsellers, USP, dovezi sociale, conținut educativ,
   newsletter, trust bar — ordine pentru conversie).
2. **Colecție** (filtre/facete via Search & Discovery, sortare, grid, card produs cu
   hover 2nd image + quick-add, paginare accesibilă, descriere SEO).
3. **PDP** (galerie+zoom+video, preț+reduceri, variante accesibile, ADD TO CART + sticky
   mobil, stoc, trust, descriere+specificații din metafields, FAQ, cross-sell,
   schema Product+Offer+AggregateRating).
4. **Search** (predictive cu imagini+preț, colecții+pagini în rezultate, „no results"
   util, filtre).
5. **Cart** (drawer + pagină, upsell, discount, free-shipping threshold, trust).
6. **Conținut** (About, Contact+form, Blog listă+articol, FAQ, pagini legale, 404 util).
7. **Cont client** (login/register, comenzi, adrese, wishlist dacă e cazul).

---

## PASUL 5 — SHOPIFY TEHNIC

OS 2.0 (JSON templates, sections everywhere, app blocks). Schema settings bogate
(editabil fără cod). Metafields/metaobjects pentru specificații/certificări. Search &
Discovery pentru filtre+recomandări. Liquid curat, JS minim (defer/async), imagini
Shopify (srcset + lazy + WebP/AVIF). Markets/valută dacă e nevoie. GA4/Meta via
Customer Events. Documentează config în `/docs/plans/06-shopify-config.md`.

---

## PASUL 6 — SEO TEHNIC

Meta unice template-izate, canonical, fără duplicat. **JSON-LD**: Organization, WebSite
(+Sitelinks Search Box), BreadcrumbList, Product, Offer, AggregateRating, Article,
FAQPage. Sitemap.xml + robots.txt. Limbă RO corectă, URL-uri curate, **REDIRECTURI 301**
de la URL-urile vechi drgreen.ro (livrează map de redirect în `/docs/plans/03-redirects-301.md`).
Heading hierarchy corectă, alt text, breadcrumbs, Open Graph + Twitter cards.
Plan în `/docs/plans/02-seo.md`.

---

## PASUL 7 — ACCESIBILITATE (WCAG 2.2 AA — cu Chrome DevTools MCP)

Contrast ≥4.5:1 text / ≥3:1 UI. Tastatură completă, focus vizibil, skip-to-content.
HTML semantic + ARIA doar unde trebuie, landmarks. Labels pe formulare, erori clare.
Alt text. Target ≥24px. Reduce-motion. Verifică cu `take_snapshot` (a11y) din Chrome
DevTools MCP + screen reader/keyboard. Raport în `/docs/plans/04-accesibilitate.md`.

---

## PASUL 8 — PERFORMANȚĂ (Core Web Vitals — cu Chrome DevTools MCP)

Țintă mobil: LCP<2.5s, INP<200ms, CLS<0.1. Imagini responsive+lazy+dimensiuni explicite.
Preload fonturi critice + `font-display:swap` + subset. CSS/JS minim, critical CSS,
defer. Rulează `lighthouse_audit` din Chrome DevTools MCP; țintă scoruri ≥90
(Perf/SEO/A11y/BP). Plan în `/docs/plans/05-performanta.md`.

---

## PASUL 9 — CONFORMITATE DE NIȘĂ

Dacă produsele o cer: age gate/disclaimer, note legale, certificate/lab reports,
mențiuni de conformitate. Verifică pe drgreen.ro + competiția SUA și replică pentru RO.
Plan în `/docs/plans/07-conformitate-nisa.md`.

---

## PASUL 10 — TESTARE PE SHOPIFY CU DATE MOCK (înainte de livrare, obligatoriu)

Folosește `superpowers:verification-before-completion` — dovezi înainte de afirmații.
- Populează dev store-ul cu produse/colecții/pagini **MOCK** reprezentative.
- Rulează `shopify theme dev`; testează TOATE template-urile (home, colecție, PDP,
  search, cart, cont, blog, legal, 404) pe desktop + mobil.
- Rulează Chrome DevTools MCP: Lighthouse + a11y snapshot pe paginile-cheie. Remediază
  ce pică (CWV, contrast, focus, layout shift).
- Abia după ce testele trec → livrezi. Raport în `/docs/plans/08-testare-mock.md`.

---

## LIVRABILE FINALE

1. Brand identity sheet (dovada păstrării identității) — `/docs/brand/`.
2. Tema Shopify completă, instalabilă (toate template-urile) — `/theme/`.
3. Documentație de editare pentru client.
4. Raport SEO + map redirect 301.
5. Raport accesibilitate WCAG 2.2 AA + scoruri Lighthouse.
6. Tabel benchmark „SUA → aplicat la drgreen.ro (identitate păstrată)".
7. Raport testare pe date mock (ce s-a testat, ce s-a remediat).
8. Repository organizat: `/docs/plans` (toate planurile non-vizuale), `/docs/brand`,
   `/theme`, plus `STATUS.md` complet și istoric git curat.

---

## CRITERII DE ACCEPTARE

- Prerechizite trecute la start: `superpowers` ✓ și `frontend-design` ✓ (altfel HARD STOP).
- Identitatea drgreen.ro clar recognoscibilă (culori/logo/ton păstrate).
- Toate paginile responsive, accesibile (AA), rapide (CWV verde) — dovedit pe date mock.
- Editabil complet din Shopify admin, fără cod.
- SEO fără regresie (redirecturi corecte).
- Frontend făcut cu skill-ul `frontend-design` pe Fable 5.
- Non-vizualul documentat ca planuri separate în repo; `STATUS.md` arată clar ce e făcut
  și ce nu; git curat și safe.
