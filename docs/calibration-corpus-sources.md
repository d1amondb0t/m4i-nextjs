# Calibration corpus — public document & PDF sources

Research date: 2026-09-08. Goal: assemble a topically-broad calibration set (politics,
economy, social impact, environment, urban/transport structures, humanitarian law &
norms, education) of **≥1,000 documents per topic**, sourced from public datasets, with
**links only** (no downloads) so a scraper can fetch them later.

Every section below comfortably exceeds 1,000 documents; most exceed 10,000. Volume
figures are as reported by the providers themselves and are approximate — verify with a
`rows=0`/`total` query before you size storage.

**Legend for "Access":**
- `API` — JSON/REST endpoint that returns PDF URLs directly
- `OAI` — OAI-PMH metadata harvest (get identifiers, then resolve to PDF)
- `Bulk` — pre-packaged dump / torrent / S3
- `Scrape` — no machine API; needs HTML crawling

---

## 0. Cross-cutting mega-corpora (use these for raw volume + PDF-layout diversity)

These are not topic-specific, but they are the cheapest way to reach very large document
counts, and most carry source-URL metadata so you can **filter by domain** (e.g. keep
`*.gov`, `*.europa.eu`, `un.org`, `worldbank.org`) to synthesise any of the topic buckets below.

| Source | Content | Est. volume | Access | Originally built for | License |
|---|---|---|---|---|---|
| [FinePDFs](https://huggingface.co/datasets/HuggingFaceFW/finepdfs) | Text extracted from PDFs across 106 CommonCrawl dumps (2013–Feb 2025), 1,733 languages; retains source URL | ~475M documents / ~3T tokens | HF `datasets` / parquet (Bulk) | LLM pretraining corpus (largest PDF-only corpus released) | ODC-By |
| [pixparse/pdfa-eng-wds](https://huggingface.co/datasets/pixparse/pdfa-eng-wds) | English PDF pages with rendered images + OCR text/word boxes (webdataset shards) | Millions of pages | HF (Bulk) | OCR-heavy **pretraining basis for vision-language models** | CC-BY-SA / mixed |
| [CCpdf](https://arxiv.org/abs/2304.14953) + [pipeline](https://github.com/applicaai/CCpdf) | **An index of PDF URLs** from Common Crawl + a downloader script — exactly the shape you asked for | ~1.1M PDF URLs, multilingual | Index + script (Scrape) | Building a high-quality multilingual visually-rich-document corpus for pretraining | Index: open |
| [pdf-association/pdf-corpora](https://github.com/pdf-association/pdf-corpora) | Curated **index of other PDF corpora** (govdocs1, CommonCrawl PDF subsets, Safedocs) | Meta-index | GitHub | PDF-parser conformance & robustness testing | Various |
| [GovScape / End of Term Web Archive PDFs](https://arxiv.org/abs/2511.11010) | 10,015,993 US government PDFs (70.9M pages) from 24,877 `.gov`/`.mil` domains, 2020 EOT crawl | ~10M PDFs | Search UI + [EOT bulk WARCs](https://eotarchive.org/data/) on Internet Archive / AWS Open Data (Bulk) | Public multimodal (text+visual) search over government PDFs | US public domain |
| [CORE](https://core.ac.uk/documentation/api) | Aggregated open-access research papers from 10,000+ repositories; `downloadUrl` gives direct PDF | 300M+ metadata / 40M+ full texts | API (free key) + [full dump](https://core.ac.uk/documentation/dataset) | Open-access discovery & text-mining infrastructure | Per-record OA licences |
| [OpenAlex](https://docs.openalex.org/) + [Unpaywall](https://unpaywall.org/products/api) | Scholarly metadata with OA locations (`best_oa_location.pdf_url`) across all disciplines | 250M+ works | API + snapshot (Bulk) | Open scholarly graph / OA link resolution | CC0 |

**Document-AI / layout calibration extras** (useful if your calibration set also needs
visual/structural diversity rather than just topical): [DocLayNet](https://huggingface.co/datasets/ds4sd/DocLayNet),
[PubLayNet](https://github.com/ibm-aur-nlp/PubLayNet), [DocBank](https://github.com/doc-analysis/DocBank),
[RVL-CDIP](https://huggingface.co/datasets/aharley/rvl_cdip), [OmniDocBench](https://github.com/opendatalab/OmniDocBench).

---

## 1. Politics & governance

| Source | Content | Est. volume | Access | Originally built for | License |
|---|---|---|---|---|---|
| [GovInfo (US GPO)](https://www.govinfo.gov/developers) | Congressional bills, hearings, reports, Federal Register, CFR, presidential documents — **native PDF + XML** | Millions of documents | [API](https://api.govinfo.gov/docs) + [Bulk Data repo](https://www.govinfo.gov/bulkdata) | Authenticated public access to US federal publications | US public domain |
| [EveryCRSReport](https://www.everycrsreport.com/download.html) | Congressional Research Service policy analysis reports, PDF + HTML, all versions | ~23,400 reports | [`reports.csv`](https://www.everycrsreport.com/reports.csv) → per-report `/reports/{id}.json` → `files/` PDF path (Bulk) | Making taxpayer-funded policy research public | US public domain |
| [EUR-Lex / CELLAR](https://eur-lex.europa.eu/content/help/data-reuse/reuse-contents-eurlex-details.html) | EU treaties, regulations, directives, decisions, case law, preparatory acts, 24 languages | 1.5M+ documents | [SPARQL + REST on CELLAR](https://op.europa.eu/en/web/cellar), weekly RDF bulk packages | Official EU legal publication + open reuse | CC-BY-4.0-ish (EU reuse notice) |
| [UN Digital Library](https://digitallibrary.un.org/) / [ODS](https://documents.un.org/) | GA/SC/ECOSOC resolutions, reports, meeting records, voting data; born-digital PDFs 1993→ | 1M+ records | OAI-PMH (`/oai2d`) + search (OAI/Scrape) | Single global access point to UN documentation | UN public |
| [ParlaMint 4.0](https://www.clarin.si/repository/xmlui/handle/11356/1859) | Parliamentary debate transcripts, 29 European countries, TEI XML, rich speaker metadata, English MT | >1.1B words, 24k speakers | CLARIN download (Bulk) | Comparable/interoperable **parliamentary corpora** for political & linguistic research | CC-BY / CC-BY-NC |
| [Manifesto Project (MARPOR)](https://manifesto-project.wzb.eu/) | Party election manifestos, coded, many countries, 1945→ | ~5,000 manifestos | API + download (registration) | Coding party policy positions for comparative politics | Custom academic |
| [Congress.gov API](https://api.congress.gov/) | Bills, amendments, committee reports, member data, CRS report links | Millions of records | API | Legislative transparency | US public domain |
| [Federal Register API](https://www.federalregister.gov/developers/documentation/api/v1) / [Regulations.gov](https://open.gsa.gov/api/regulationsgov/) | Rules, proposed rules, notices; docket attachments as PDF | 1M+ documents | API | Rulemaking transparency | US public domain |
| [GovReport](https://huggingface.co/datasets/launch/gov_report) | US GAO + CRS national policy reports with expert summaries | 19,465 reports | HF (Bulk) | **Long-document summarization** training/eval | Public domain |
| [BillSum](https://huggingface.co/datasets/FiscalNote/billsum) | US Congressional + California bills with CRS summaries | 22,218 pairs | HF (Bulk) | **Summarization of legislation** | CC0 |
| [data.europa.eu](https://data.europa.eu/data/datasets) | Pan-EU open data catalogue incl. institutional publications & reports | 1M+ datasets | CKAN/DCAT API | EU open data reuse | Mostly CC-BY |

---

## 2. Economy & finance

| Source | Content | Est. volume | Access | Originally built for | License |
|---|---|---|---|---|---|
| [World Bank Documents & Reports](https://documents.worldbank.org/en/publication/documents-reports/api) | Project appraisals, country economic memoranda, sector reports, evaluations | ~500k+ documents | **API** `https://search.worldbank.org/api/v3/wds?format=json&fl=pdfurl&rows=…&os=…` — `pdfurl` is a direct PDF link | Public disclosure of Bank operational & analytical work | CC-BY 3.0 IGO (most) |
| [World Bank Open Knowledge Repository](https://openknowledge.worldbank.org/) | Books, working papers, flagship reports (WDR), technical papers | ~40k+ publications | DSpace + **OAI-PMH** | Official OA repository for Bank research | CC-BY 3.0 IGO |
| [IMF Publications](https://www.imf.org/en/Publications) | Article IV country reports, WEO, GFSR, Fiscal Monitor, working papers | 21,000+ publications | Scrape / [IMF eLibrary](https://www.elibrary.imf.org/) | Surveillance & research dissemination | IMF terms (free to read) |
| [BIS central bankers' speeches](https://www.bis.org/cbspeeches/download.htm) | Speech texts, ~1,000 officials, 100+ central banks, 1997→ | 19,742 speeches | Pre-compiled full-text extract (Bulk) + [gingado](https://github.com/bis-med-it/gingado) | Monetary-policy communication research | BIS terms, non-commercial research |
| [CBS Dataset](https://cbspeeches.com/) | BIS collection extended by scraping 131 central banks, 1986–2023 | 35,487 speeches | Download (Bulk) | Academic central-bank communication analysis | Academic |
| [FRASER (St. Louis Fed)](https://fraser.stlouisfed.org/) | US economic/financial/banking history: statistical releases, congressional testimony, archival collections | 500,000+ publications | [REST API](https://research.stlouisfed.org/docs/api/fraser/) returns PDF **and** plain-text URLs | Digital library of US economic history | Mostly public domain |
| [OECD publications](https://www.oecd.org/en/publications.html) | Economic Outlook, country surveys, sector studies (fully **open access since July 2024**, iLibrary retired) | 20,000+ titles | Scrape / [OECD Data Explorer API](https://data-explorer.oecd.org/) | Policy analysis dissemination | CC-BY-4.0 (new policy) |
| [EconStor (ZBW)](https://www.econstor.eu/) | Open-access economics working papers, reports, conference papers | ~250k full texts | **OAI-PMH** | OA repository for economics | Per-item OA |
| [RePEc / IDEAS](http://ideas.repec.org/) | Aggregated economics working papers incl. NBER, CEPR, Fed series | 4M+ items, ~3.5M downloadable | [RePEc data](http://repec.org/) (Bulk) | Bibliographic infrastructure for economics | Metadata free |
| [EDGAR-CORPUS](https://huggingface.co/datasets/eloukas/edgar-corpus) / [SEC EDGAR full-text](https://www.sec.gov/edgar/sec-api-documentation) | Annual/quarterly corporate filings (10-K, 10-Q), 1993→ | 200k+ filings | HF (Bulk) / SEC API | **Financial NLP** pretraining & benchmarking | Public domain |
| [ECB publications](https://www.ecb.europa.eu/press/pubbydate/html/index.en.html) | Monetary policy accounts, Economic Bulletin, working papers | 10,000+ | RSS/scrape | Central-bank transparency | ECB reuse terms |

---

## 3. Social impact & social science

| Source | Content | Est. volume | Access | Originally built for | License |
|---|---|---|---|---|---|
| [SSOAR (GESIS)](https://www.ssoar.info/) | Peer-reviewed social science articles, working papers, reports — **full-text PDF** | 95,000+ full texts | **OAI-PMH**, metadata CC0 | European OA publication server for the social sciences | Per-item OA (mostly CC) |
| [SocArXiv / OSF Preprints](https://osf.io/preprints/socarxiv) | Social science preprints, working papers, published-paper copies | 10,000+ preprints | [OSF API](https://developer.osf.io/) | Free, open preprint infrastructure for social science | CC-BY (mostly) |
| [ALNAP HELP Library](https://alnap.org/help-library/) | Humanitarian & development evaluations, learning reviews, guidance | 22,000+ resources (3,000+ evaluations) | Scrape / site search | Sector-wide accountability & performance learning | Mixed, mostly free |
| [3ie Development Evidence Portal](https://developmentevidence.3ieimpact.org/) | Impact evaluations, systematic reviews on development interventions | 10,000+ records | Search + API-ish | Evidence base for development effectiveness | Mixed OA |
| [IATI Registry / d-portal](https://iatiregistry.org/) | Aid activity documents: project reports, evaluations, results frameworks | 1M+ activities, many linked docs | [IATI Datastore API](https://docs.datastore.iatistandard.org/) | Aid transparency standard | Open |
| [UN DESA / SDG reports](https://sdgs.un.org/documents) | Voluntary National Reviews, SDG progress reports, expert group papers | 5,000+ documents | Scrape | SDG follow-up & review | UN public |
| [ICPSR / openICPSR](https://www.openicpsr.org/) | Social science study documentation, codebooks, methodology reports (PDF-heavy) | 15,000+ studies | API + OAI | Social science data archiving | Mixed |
| [Eurofound publications](https://www.eurofound.europa.eu/en/publications) | Working conditions, quality of life, social policy reports across EU | 5,000+ | Scrape | EU social policy evidence | CC-BY-4.0 |
| [OpenAlex → OA social science subset](https://docs.openalex.org/) | Filter by concept (sociology, public policy, development studies) → OA PDF URLs | Millions | API | Open scholarly graph | CC0 metadata |

> **Caution:** think-tank output (Pew, Brookings, RAND, Chatham House) is topically ideal but
> usually all-rights-reserved. RAND and Brookings PDFs are freely downloadable but not openly
> licensed — fine for a private calibration set, risky to redistribute.

---

## 4. Environment & climate

| Source | Content | Est. volume | Access | Originally built for | License |
|---|---|---|---|---|---|
| [NEPATEC 2.0 (PNNL)](https://huggingface.co/datasets/PNNL/NEPATEC2.0) | NEPA environmental review documents (EIS, EA, appendices) from 60,000+ federal projects, 60+ agencies | **120,000+ documents** | HF (Bulk); source PDFs via [EPA EIS database](https://cdxapps.epa.gov/cdx-enepa-II/public/action/eis/search) | Domain-adaptation LLM training + policy analytics on environmental review | US public domain |
| [NEPATEC 1.0](https://huggingface.co/datasets/PolicyAI/NEPATEC1.0) | Predecessor: 2,917 projects, 4.8M pages, 3.6B tokens | 28,212 documents | HF (Bulk) | First large-scale NEPA text corpus | US public domain |
| [Climate Policy Radar / CCLW](https://huggingface.co/datasets/ClimatePolicyRadar/all-document-text-data) | National climate laws, policies, NDCs, litigation, Global Stocktake submissions, corporate transition plans — full text + metadata + source PDF URLs | **30,000+ documents** (+2,000 GST) | HF + [open-data on S3](https://github.com/climatepolicyradar/open-data) | Open climate-policy knowledge graph & search; ML concept classifiers | Open (CPR open data) |
| [UNFCCC NDC Registry](https://unfccc.int/NDCREG) | Nationally Determined Contributions, all Parties, multiple submission rounds | ~200 Parties × several rounds; plus [National Communications / BTRs](https://unfccc.int/national-reports) — thousands of PDFs | Scrape + [CSV/JSON mirror](https://openclimatedata.net/ndcs) | Paris Agreement transparency | UN public |
| [UNEP Document Repository](https://wedocs.unep.org/) | Environmental assessments, GEO reports, resolutions | 40,000+ items | DSpace **OAI-PMH** | UNEP institutional repository | Mostly CC-BY-SA IGO |
| [FAO Document Repository](https://www.fao.org/documents/en/) | Land, water, food systems, forestry, agri-environment reports | 100,000+ documents | OAI + search | FAO knowledge dissemination | CC-BY-NC-SA IGO |
| [European Environment Agency](https://www.eea.europa.eu/en/analysis/publications) | EU environmental state & outlook, indicator reports | 3,000+ | Scrape / [EEA API](https://www.eea.europa.eu/en/datahub) | EU environmental reporting | CC-BY-4.0 |
| [IPCC reports](https://www.ipcc.ch/reports/) | AR6 WG I/II/III, SR1.5, SRCCL, SROCC — chapter-level PDFs | ~500 chapter/annex PDFs | Scrape | Scientific assessment for policymakers | IPCC terms, free |
| [IRENA](https://www.irena.org/Publications) / [IEA](https://www.iea.org/reports) | Renewables, energy transition, country energy reviews | 2,000+ / 1,000+ | Scrape | Energy policy analysis | Mixed (IRENA CC-BY, IEA restrictive) |
| [ClimaText / climate-fever / ClimateBERT corpora](https://huggingface.co/climatebert) | Sentence-level climate-topic datasets (small but well-labelled) | 10k–100k sentences | HF | **Climate-domain LM training & claim verification** | CC-BY |

---

## 5. Urban structures, city transport & infrastructure

This is the hardest bucket to reach 1,000+ *cleanly*; ROSA P + TRB + World Bank transport
comfortably get you there.

| Source | Content | Est. volume | Access | Originally built for | License |
|---|---|---|---|---|---|
| [ROSA P — National Transportation Library](https://rosap.ntl.bts.gov/) | Full-text US DOT + state DOT transportation research reports, transit studies, safety analyses — **all public domain, all full text** | 50,000+ items | **OAI-PMH REST**: `https://rosap.ntl.bts.gov/fedora/oai?verb=ListRecords&metadataPrefix=oai_dc` | US DOT public-access repository for federally funded transportation research | US public domain |
| [TRID (TRB)](https://trid.trb.org/) | World's largest transportation bibliographic database; many records link to free full text (often ROSA P) | ~1.5M records | Search + record links (Scrape) | Bibliographic index of transportation research | Metadata free |
| [TRB / National Academies Press](https://nap.nationalacademies.org/author/TRB/transportation-research-board) | NCHRP, TCRP, ACRP research reports & syntheses — free PDF after login-free download | 3,000+ reports | Scrape | Applied transportation research programmes | Free-to-read |
| [Eltis / EU Urban Mobility Observatory](https://www.eltis.org/mobility-plans) | Sustainable Urban Mobility Plans (SUMPs), guidelines, city case studies; [EU SUMP city database](https://urban-mobility-observatory.transport.ec.europa.eu/sustainable-urban-mobility-plans_en) covers 431 TEN-T urban nodes | ~1,000+ plans & case studies | Scrape | EU urban mobility knowledge exchange | CC-BY-ish EU reuse |
| [ITF/OECD Transport](https://www.itf-oecd.org/publications) | Transport outlooks, roundtable reports, country reviews | 1,500+ | Scrape | Transport policy analysis | OECD open access |
| [UN-Habitat Knowledge](https://unhabitat.org/knowledge/publications) | World Cities Report, urban planning guidance, country urban profiles | 3,000+ | Scrape | Sustainable urbanisation policy | CC-BY IGO (mostly) |
| [World Bank transport & urban sector](https://documents.worldbank.org/) | Filter D&R API by `majdocsubtype`/topic = Transport / Urban Development | 20,000+ docs | Same API as §2 | Project disclosure | CC-BY 3.0 IGO |
| [ADB](https://www.adb.org/publications) / [EIB](https://www.eib.org/en/publications/) | Asian & European infrastructure project reports, urban transport appraisals | 5,000+ combined | Scrape | Development bank disclosure | CC-BY-NC-ND / CC-BY |
| Municipal open-data portals via [data.gov](https://catalog.data.gov/dataset?q=transportation+plan) | City comprehensive plans, transit development plans, complete-streets studies | Long tail, thousands | CKAN API | Municipal transparency | Mostly public domain |

---

## 6. Humanitarian concerns, law, norms & rights

| Source | Content | Est. volume | Access | Originally built for | License |
|---|---|---|---|---|---|
| [ReliefWeb API](https://apidoc.reliefweb.int/) | Situation reports, needs assessments, evaluations, guidelines, maps, press releases, 1996→ | **1,000,000+ reports** | **API**: `https://api.reliefweb.int/v2/reports?appname=YOURAPP&fields[include][]=file` — `file[].url` is the PDF | Opening 20+ years of humanitarian information for reuse | Mostly free-to-reuse w/ attribution |
| [HDX (Humanitarian Data Exchange)](https://data.humdata.org/) | Datasets + attached PDF reports across crises | 20,000+ datasets | CKAN API | Humanitarian data sharing (OCHA) | Mostly CC-BY |
| [Pile of Law](https://huggingface.co/datasets/pile-of-law/pile-of-law) | ~256GB of legal/administrative text from **35 sources**: court opinions & filings, agency publications, contracts, statutes, regulations, congressional hearings, EU parliament proceedings | 35 sources, 10M+ docs | HF (Bulk) | (1) study **norms of data filtering encoded in law**, (2) legal-domain LM pretraining | CC-BY-NC-SA 4.0 |
| [CourtListener / RECAP](https://www.courtlistener.com/help/api/rest/) | US federal & state opinions + PACER dockets and filed PDFs | 9M+ opinions, millions of PACER PDFs | REST API + [bulk data](https://www.courtlistener.com/help/api/bulk-data/) | Free access to US case law (Free Law Project) | Public domain / CC |
| [UNHCR Refworld](https://www.refworld.org/) | Refugee & statelessness law: legislation, case law, country-of-origin information, UNHCR guidance | 200,000+ documents | Scrape | Authoritative refugee-law reference | Mixed, free to read |
| [HUDOC (ECtHR)](https://hudoc.echr.coe.int/) | European Court of Human Rights judgments, decisions, legal summaries | 130,000+ documents | Undocumented JSON endpoints (Scrape); scraped mirror on [openICPSR](https://www.openicpsr.org/openicpsr/project/155781/) | Public dissemination of Convention case law | Council of Europe reuse |
| [ICRC IHL Databases](https://ihl-databases.icrc.org/) | Treaties, customary IHL rules, national implementing legislation & case law | 20,000+ records | Scrape | Reference on international humanitarian law | ICRC terms |
| [OHCHR / UN Treaty Body Database](https://tbinternet.ohchr.org/) + [UPR](https://www.ohchr.org/en/hr-bodies/upr/documentation) | State reports, concluding observations, UPR national/stakeholder reports | 50,000+ documents | Scrape (+ UN ODS) | Human rights monitoring | UN public |
| [Multi-LexSum](https://huggingface.co/datasets/allenai/multi_lexsum) | US civil rights lawsuits (avg >75k words) with multi-granularity expert summaries | 9,000+ cases | HF | **Multi-document long-form legal summarization** | CC-BY-NC |
| [EUR-Lex-Sum](https://huggingface.co/datasets/dennlinger/eur-lex-sum) | EU legal acts + human summaries, 24 languages, 375 cross-lingually aligned acts | 1,500+ pairs/language | HF | Multi/cross-lingual **legal long-form summarization** | CC-BY |
| [IFRC Disaster Law](https://disasterlaw.ifrc.org/) | National disaster-risk-management laws, IDRL guidelines | 2,000+ | Scrape | Disaster law reference | Free |

---

## 7. Education

| Source | Content | Est. volume | Access | Originally built for | License |
|---|---|---|---|---|---|
| [ERIC (IES / US Dept. of Education)](https://eric.ed.gov/) | Education research: journal articles, reports, evaluations, curricula, conference papers | **2M+ records; 500,000+ hosted full-text PDFs** | **API** `https://api.ies.ed.gov/eric/?search=…&format=json&fields=id,title,description,url`; PDFs at the fully predictable `https://files.eric.ed.gov/fulltext/ED######.pdf`; also [XML dumps](https://eric.ed.gov/?download) | US national education research index | US public domain (ED docs) |
| [ERIC bulk mirrors](https://portal.datarescueproject.org/datasets/education-resources-information-center-eric/) | Full API dump (1,994,167 records, 3.2GB JSONL, [Zenodo](https://zenodo.org/records/15032840)) + a **600GB torrent of all ~500k PDFs** via [SciOp](https://sciop.net/datasets/eric-api-pdf) | 500k PDFs | Bulk / torrent | Data-rescue preservation of ERIC | Public domain |
| [UNESDOC (UNESCO)](https://unesdoc.unesco.org/) | Education policy, GEM Reports, teacher policy, curriculum & literacy studies, all UNESCO fields | ~150,000 documents (~6,600 explicitly Open Access) | Scrape / [ARK-based URLs](https://unesdoc.unesco.org/ark:/48223/) | UNESCO institutional documentary heritage | CC-BY-SA 3.0 IGO for OA subset |
| [World Bank Education sector](https://documents.worldbank.org/) | Education project appraisals, SABER country reports, learning-poverty analyses | 15,000+ docs | D&R API filtered by topic | Project disclosure | CC-BY 3.0 IGO |
| [OECD Education](https://www.oecd.org/en/topics/education-and-skills.html) | PISA/PIAAC/TALIS reports, Education at a Glance, country education policy reviews | 2,000+ | Scrape | International education benchmarking | CC-BY-4.0 (post-2024) |
| [Eurydice (EU)](https://eurydice.eacea.ec.europa.eu/publications) | National education system descriptions & comparative reports, all EU states | 1,000+ reports | Scrape | EU education-system comparison | CC-BY-4.0 |
| [IBE-UNESCO curriculum resources](http://www.ibe.unesco.org/en/documents) | National curriculum frameworks & profiles by country | 3,000+ | Scrape | Curriculum development reference | UNESCO terms |
| [IES / NCES publications](https://nces.ed.gov/pubsearch/) | US education statistics reports, condition-of-education, longitudinal study docs | 5,000+ PDFs | Scrape / govinfo | US federal education statistics | Public domain |
| [OER Commons](https://oercommons.org/) / [MERLOT](https://www.merlot.org/) | Open educational resources incl. teaching materials & textbooks | 100,000+ resources | API/scrape | Open educational resource sharing | Mostly CC |

---

## Practical notes for the scraper

1. **Cheapest 1,000-per-topic wins, in order:** ReliefWeb API (humanitarian), ERIC
   `files.eric.ed.gov` predictable URLs (education), World Bank D&R `pdfurl` field
   (economy + transport + education), ROSA P OAI-PMH (transport), Climate Policy Radar
   HF dataset (environment), EveryCRSReport `reports.csv` (politics), SSOAR OAI (social).
   Each of these gives you PDF URLs from a single machine-readable call — no HTML parsing.
2. **`appname` / API keys:** ReliefWeb wants `appname=` (may become mandatory); CORE,
   govinfo, Congress.gov, FRASER and Regulations.gov require free API keys.
3. **Politeness:** most of these are public-sector servers with no CDN. Cap concurrency
   (2–4), set a descriptive `User-Agent` with a contact address, and honour `robots.txt` —
   UNESDOC, HUDOC and Refworld in particular will rate-limit or block aggressive crawlers.
4. **Dedupe by content hash, not URL** — World Bank / ReliefWeb / UNDL republish the same
   PDF under multiple identifiers, and FinePDFs overlaps heavily with several `.gov` sources.
5. **Licensing:** for a private calibration set, "freely downloadable" is generally enough.
   If the calibration set is redistributed, restrict to public-domain (US federal),
   CC-BY/CC0, and CC-BY IGO sources; Pile of Law (NC), Multi-LexSum (NC) and IEA are the
   notable non-commercial ones above.
6. **Balance:** if you draw naively, US federal documents will dominate. Consider capping
   per-domain counts and topping up from EU (EUR-Lex, Eurydice, EEA, Eltis) and UN
   (UNDL, UNESDOC, UNEP, ReliefWeb) sources to keep register and phrasing diverse.
