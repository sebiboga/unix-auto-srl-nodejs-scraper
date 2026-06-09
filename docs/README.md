# job_seeker_ro_spider

**job_seeker_ro_spider** — scraper pentru job-urile UNIX AUTO din România.

Extrage anunțurile de pe [Unixauto Careers](https://www.unixauto.ro/cariera/cautator) și le publică în [peviitor.ro](https://peviitor.ro) prin API-ul SOLR.

## Identificare

Toate request-urile HTTP folosesc User-Agent-ul:

```
job_seeker_ro_spider
```

## Abordare

Spre deosebire de scraper-ele care consumă un API JSON, acest scraper parsează HTML-ul static al paginii de cariere Unixauto cu **cheerio** (fără headless browser). Asta e posibil deoarece site-ul e un site static (Astro-like), nu o aplicație SPA.

## Ce face

1. **Validează compania** — interoghează API-ul public ANAF ([demoanaf.ro](https://demoanaf.ro)) după CIF-ul UNIX AUTO (10542416) și verifică:
   - Denumirea oficială: UNIX AUTO SRL
   - Status: activ/inactiv/radiat
   - Adresa completă din registrul comerțului
2. **Cross-validează cu Peviitor** — verifică existența companiei în API-ul Peviitor
3. **Scrape-uiește job-urile** — extrage lista completă de job-uri din HTML-ul paginii `https://www.unixauto.ro/cariera/cautator` folosind selectoare CSS pe elementele `.karrierjob`
4. **Transformă datele** — extrage titlul, URL-ul, orașul (prima locație), setează workmode `on-site` și data curentă
5. **Stochează în SOLR** — upsert în `job` core

## Structură proiect

```
├── index.js           # Orchestrator principal (cheerio-based)
├── company.js         # Validare companie (ANAF + Peviitor + SOLR)
├── demoanaf.js        # CLI wrapper pentru src/anaf.js
├── src/anaf.js        # Modul ANAF API (search + company details)
├── solr.js            # Operații SOLR (query, upsert, delete, company)
├── company.json       # Cache companie (fallback când ANAF e down)
├── tests/
│   ├── unit/          # 7+ teste unitare (HTML mock-uit)
│   ├── integration/   # Teste de integrare (ANAF + SOLR live)
│   └── e2e/           # Teste end-to-end (pipelin complet)
└── .github/workflows/
    ├── scrape.yml     # Rulează zilnic la 6 AM UTC
    └── test.yml       # Teste automate la fiecare push/PR
```

## API-uri folosite

| API | URL | Autentificare |
|---|---|---|
| Unixauto Careers | `https://www.unixauto.ro/cariera/cautator` | Public (HTML) |
| ANAF (demoanaf) | `https://demoanaf.ro/api/...` | Public |
| Peviitor | `https://api.peviitor.ro/v1/company/` | Public |
| SOLR (job core) | `https://solr.peviitor.ro/solr/job` | `SOLR_AUTH` |
| SOLR (company core) | `https://solr.peviitor.ro/solr/company` | `SOLR_AUTH` |

## Testare

```bash
# Toate testele
npm test

# Doar unitare
npm run test:unit

# Doar E2E (HTML real + ANAF + SOLR condițional)
npm run test:e2e
```

Testele SOLR folosesc `itIfSolr` — se auto-skip dacă variabila `SOLR_AUTH` nu e setată.
