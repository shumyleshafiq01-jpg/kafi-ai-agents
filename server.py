"""
KAFI AI Agent — Web Intelligence Server
========================================
A local Python backend that:
  1. Serves the static frontend (index.html, admin.html, etc.)
  2. Provides API endpoints for web scraping, search, and page analysis.

Usage:
    python server.py
    → Opens http://localhost:8000

Endpoints:
    GET  /                        → Static files
    POST /api/search              → Keyword-based web search (DuckDuckGo)
    POST /api/scrape              → Scrape a specific URL for business intel
    POST /api/analyze-batch       → Batch analyze multiple URLs
"""

import contextlib
import http.server
import json
import os
import re
import socket
import sys
import urllib.parse
import urllib.request
import ssl
import threading
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

# Windows consoles often default to cp1252, which cannot print the
# box-drawing characters in the startup banner.
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── Lazy imports (installed via pip) ─────────────────────────
try:
    import requests
    from bs4 import BeautifulSoup
    HAS_SCRAPER = True
except ImportError:
    HAS_SCRAPER = False
    print("[!] Missing packages. Run:  pip install requests beautifulsoup4 lxml")

# ── Constants ────────────────────────────────────────────────
PORT = 8000
WEB_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Country → Continent mapping (top export markets for KAFI Group)
COUNTRY_CONTINENT = {
    # Middle East
    "ae": ("UAE", "Middle East"), "sa": ("Saudi Arabia", "Middle East"),
    "qa": ("Qatar", "Middle East"), "kw": ("Kuwait", "Middle East"),
    "bh": ("Bahrain", "Middle East"), "om": ("Oman", "Middle East"),
    "iq": ("Iraq", "Middle East"), "jo": ("Jordan", "Middle East"),
    "lb": ("Lebanon", "Middle East"), "ye": ("Yemen", "Middle East"),
    # Europe
    "uk": ("United Kingdom", "Europe"), "gb": ("United Kingdom", "Europe"),
    "de": ("Germany", "Europe"), "fr": ("France", "Europe"),
    "nl": ("Netherlands", "Europe"), "it": ("Italy", "Europe"),
    "es": ("Spain", "Europe"), "be": ("Belgium", "Europe"),
    "se": ("Sweden", "Europe"), "dk": ("Denmark", "Europe"),
    "no": ("Norway", "Europe"), "fi": ("Finland", "Europe"),
    "pl": ("Poland", "Europe"), "at": ("Austria", "Europe"),
    "ch": ("Switzerland", "Europe"), "ie": ("Ireland", "Europe"),
    "pt": ("Portugal", "Europe"), "gr": ("Greece", "Europe"),
    "cz": ("Czech Republic", "Europe"), "ro": ("Romania", "Europe"),
    # North America
    "us": ("United States", "North America"), "ca": ("Canada", "North America"),
    "mx": ("Mexico", "North America"),
    # Asia Pacific
    "cn": ("China", "Asia Pacific"), "jp": ("Japan", "Asia Pacific"),
    "kr": ("South Korea", "Asia Pacific"), "in": ("India", "Asia Pacific"),
    "sg": ("Singapore", "Asia Pacific"), "my": ("Malaysia", "Asia Pacific"),
    "th": ("Thailand", "Asia Pacific"), "id": ("Indonesia", "Asia Pacific"),
    "ph": ("Philippines", "Asia Pacific"), "vn": ("Vietnam", "Asia Pacific"),
    "au": ("Australia", "Asia Pacific"), "nz": ("New Zealand", "Asia Pacific"),
    "hk": ("Hong Kong", "Asia Pacific"), "tw": ("Taiwan", "Asia Pacific"),
    # Africa
    "za": ("South Africa", "Africa"), "ng": ("Nigeria", "Africa"),
    "ke": ("Kenya", "Africa"), "eg": ("Egypt", "Africa"),
    "gh": ("Ghana", "Africa"), "tz": ("Tanzania", "Africa"),
    "et": ("Ethiopia", "Africa"), "ma": ("Morocco", "Africa"),
    "dz": ("Algeria", "Africa"), "tn": ("Tunisia", "Africa"),
    # South America
    "br": ("Brazil", "South America"), "ar": ("Argentina", "South America"),
    "cl": ("Chile", "South America"), "co": ("Colombia", "South America"),
    "pe": ("Peru", "South America"),
    # South Asia / Pakistan region
    "pk": ("Pakistan", "South Asia"), "bd": ("Bangladesh", "South Asia"),
    "lk": ("Sri Lanka", "South Asia"), "np": ("Nepal", "South Asia"),
    # CIS / Central Asia
    "ru": ("Russia", "CIS"), "kz": ("Kazakhstan", "CIS"),
    "uz": ("Uzbekistan", "CIS"), "tr": ("Turkey", "Europe/Asia"),
}

# Keywords that indicate a company is a competitor (rice/salt/spice exporter)
COMPETITOR_KEYWORDS = [
    "exporter", "export", "manufacturer", "producer", "supplier",
    "processing", "mill", "milling", "factory", "pvt", "limited",
    "trading company", "agro", "agri", "agricultural",
    "rice mill", "salt mine", "spice factory",
]

# Keywords that indicate a potential client (importer/buyer/distributor)
CLIENT_KEYWORDS = [
    "importer", "import", "distributor", "distribution", "wholesale",
    "wholesaler", "buyer", "retailer", "supermarket", "grocery",
    "food service", "horeca", "catering", "procurement",
    "trading house", "commodity trader",
]


# ═══════════════════════════════════════════════════════════════
#  SCRAPER ENGINE
# ═══════════════════════════════════════════════════════════════

def search_duckduckgo(query, max_results=20):
    """
    Search DuckDuckGo HTML and extract result links + snippets.
    No API key required.
    """
    results = []
    encoded = urllib.parse.quote_plus(query)
    url = f"https://html.duckduckgo.com/html/?q={encoded}"

    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")

        for item in soup.select(".result"):
            title_tag = item.select_one(".result__a")
            snippet_tag = item.select_one(".result__snippet")
            url_tag = item.select_one(".result__url")

            if not title_tag:
                continue

            # DuckDuckGo wraps real URLs in a redirect
            href = title_tag.get("href", "")
            # Extract actual URL from DDG redirect
            if "uddg=" in href:
                parsed = urllib.parse.parse_qs(urllib.parse.urlparse(href).query)
                href = parsed.get("uddg", [href])[0]

            results.append({
                "title": title_tag.get_text(strip=True),
                "url": href,
                "snippet": snippet_tag.get_text(strip=True) if snippet_tag else "",
                "displayUrl": url_tag.get_text(strip=True) if url_tag else href,
            })

            if len(results) >= max_results:
                break
    except Exception as e:
        print(f"[Search Error] {e}")

    return results


def scrape_page(url):
    """
    Scrape a single URL and extract business intelligence:
    - Company name, description, contact info
    - Product keywords, certifications
    - Country/continent detection
    """
    result = {
        "url": url,
        "title": "",
        "description": "",
        "emails": [],
        "phones": [],
        "products": [],
        "certifications": [],
        "country": "Unknown",
        "continent": "Unknown",
        "companyType": "unknown",  # competitor | potential_client | unknown
        "rawText": "",
        "success": True,
        "error": None,
    }

    try:
        resp = requests.get(url, headers=HEADERS, timeout=12, allow_redirects=True)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")

        # Title
        title_tag = soup.find("title")
        result["title"] = title_tag.get_text(strip=True) if title_tag else ""

        # Meta description
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc:
            result["description"] = meta_desc.get("content", "")

        # Extract visible text (for keyword analysis)
        for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            tag.decompose()
        raw_text = soup.get_text(separator=" ", strip=True)
        # Limit to first 5000 chars for analysis
        raw_text_short = raw_text[:5000]
        result["rawText"] = raw_text_short

        lower_text = raw_text_short.lower()

        # Extract emails
        emails = set(re.findall(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", raw_text))
        result["emails"] = list(emails)[:5]

        # Extract phone numbers
        phones = set(re.findall(r"[\+]?[\d\s\-\(\)]{7,15}", raw_text))
        result["phones"] = [p.strip() for p in list(phones)[:5] if len(p.strip()) >= 7]

        # Detect products relevant to KAFI Group
        kafi_products = {
            "rice": ["rice", "basmati", "sella", "parboiled", "long grain", "chawal"],
            "salt": ["salt", "himalayan", "pink salt", "rock salt", "sea salt", "khewra"],
            "spices": ["spice", "masala", "turmeric", "chili", "cumin", "coriander", "condiment"],
            "vermicelli": ["vermicelli", "seviyan", "pheni", "kunafa", "noodle"],
            "dessert": ["custard", "jelly", "dessert", "pudding"],
            "juice": ["juice", "extract", "beverage", "drink"],
        }
        found_products = []
        for cat, keywords in kafi_products.items():
            for kw in keywords:
                if kw in lower_text:
                    found_products.append(cat)
                    break
        result["products"] = list(set(found_products))

        # Detect certifications
        cert_patterns = [
            "iso 9001", "iso 22000", "iso 14001", "haccp", "halal",
            "brc", "fssc", "gmp", "organic", "fair trade", "kosher",
            "fda approved", "usda", "eu certified",
        ]
        found_certs = [c.upper() for c in cert_patterns if c in lower_text]
        result["certifications"] = found_certs

        # Country/Continent detection from domain TLD
        parsed_url = urllib.parse.urlparse(url)
        domain = parsed_url.netloc.lower()
        tld = domain.rsplit(".", 1)[-1] if "." in domain else ""

        if tld in COUNTRY_CONTINENT:
            result["country"], result["continent"] = COUNTRY_CONTINENT[tld]
        else:
            # Fallback: scan page text for country names
            for code, (country, continent) in COUNTRY_CONTINENT.items():
                if country.lower() in lower_text:
                    result["country"] = country
                    result["continent"] = continent
                    break

        # Classify: competitor or potential client
        competitor_score = sum(1 for kw in COMPETITOR_KEYWORDS if kw in lower_text)
        client_score = sum(1 for kw in CLIENT_KEYWORDS if kw in lower_text)

        if competitor_score > client_score and competitor_score >= 2:
            result["companyType"] = "competitor"
        elif client_score > competitor_score and client_score >= 2:
            result["companyType"] = "potential_client"
        else:
            result["companyType"] = "unknown"

    except requests.exceptions.Timeout:
        result["success"] = False
        result["error"] = "Request timed out"
    except requests.exceptions.ConnectionError:
        result["success"] = False
        result["error"] = "Connection failed"
    except Exception as e:
        result["success"] = False
        result["error"] = str(e)

    return result


def classify_search_results(search_results):
    """
    Take raw search results and enrich them with quick domain-based classification.
    """
    enriched = []
    for item in search_results:
        url = item.get("url", "")
        parsed = urllib.parse.urlparse(url)
        domain = parsed.netloc.lower()
        tld = domain.rsplit(".", 1)[-1] if "." in domain else ""

        country = "Unknown"
        continent = "Unknown"
        if tld in COUNTRY_CONTINENT:
            country, continent = COUNTRY_CONTINENT[tld]

        snippet_lower = (item.get("snippet", "") + " " + item.get("title", "")).lower()

        # Quick classification from snippet
        comp_score = sum(1 for kw in COMPETITOR_KEYWORDS if kw in snippet_lower)
        client_score = sum(1 for kw in CLIENT_KEYWORDS if kw in snippet_lower)

        company_type = "unknown"
        if comp_score > client_score:
            company_type = "competitor"
        elif client_score > comp_score:
            company_type = "potential_client"

        enriched.append({
            **item,
            "domain": domain,
            "tld": tld,
            "country": country,
            "continent": continent,
            "companyType": company_type,
        })

    return enriched


# ═══════════════════════════════════════════════════════════════
#  UNIVERSAL AI ENGINE (multi-provider, with failover)
# ═══════════════════════════════════════════════════════════════

import os

from kafi_paths import data_path, base_url, outlook_callback_url

ADMIN_PASSWORD = os.environ.get("KAFI_ADMIN_PASSWORD", "kafi2026")
AI_CONFIG_PATH = data_path("ai-config.json")

# Default base URLs / models per provider. "manus", "cursor" and "custom"
# require an OpenAI-compatible baseUrl supplied in settings.
PROVIDER_DEFAULTS = {
    "anthropic":  {"baseUrl": "https://api.anthropic.com",                          "model": "claude-sonnet-4-6"},
    "openai":     {"baseUrl": "https://api.openai.com/v1",                          "model": "gpt-4o"},
    "gemini":     {"baseUrl": "https://generativelanguage.googleapis.com/v1beta",   "model": "gemini-2.5-flash"},
    "openrouter": {"baseUrl": "https://openrouter.ai/api/v1",                       "model": "google/gemma-4-31b-it:free"},
    "deepseek":   {"baseUrl": "https://api.deepseek.com/v1",                        "model": "deepseek-chat"},
    "meta":       {"baseUrl": "https://api.llama.com/compat/v1",                    "model": "Llama-4-Maverick-17B-128E-Instruct-FP8"},
    "manus":      {"baseUrl": "",                                                   "model": ""},
    "cursor":     {"baseUrl": "",                                                   "model": ""},
    "custom":     {"baseUrl": "",                                                   "model": ""},
}


def load_ai_config():
    """Load the provider chain from data/ai-config.json."""
    try:
        with open(AI_CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            return cfg if isinstance(cfg.get("providers"), list) else {"providers": []}
    except (FileNotFoundError, json.JSONDecodeError):
        return {"providers": []}


def save_ai_config(cfg):
    os.makedirs(os.path.dirname(AI_CONFIG_PATH), exist_ok=True)
    with open(AI_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


def mask_key(key):
    if not key:
        return ""
    return ("•" * max(len(key) - 4, 4)) + key[-4:]


def _call_openai_compatible(base_url, api_key, model, system, messages, max_tokens, extra_headers=None):
    """Works for OpenAI, OpenRouter, DeepSeek, Meta Llama API, Manus/Cursor/custom endpoints."""
    url = base_url.rstrip("/") + "/chat/completions"
    msgs = ([{"role": "system", "content": system}] if system else []) + messages
    payload = {"model": model, "messages": msgs, "max_tokens": max_tokens}
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    if extra_headers:
        headers.update(extra_headers)
    resp = requests.post(url, headers=headers, json=payload, timeout=90)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


def _call_anthropic(base_url, api_key, model, system, messages, max_tokens):
    url = base_url.rstrip("/") + "/v1/messages"
    payload = {"model": model, "max_tokens": max_tokens, "messages": messages}
    if system:
        payload["system"] = system
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=90)
    resp.raise_for_status()
    data = resp.json()
    return "".join(block.get("text", "") for block in data.get("content", []))


def _call_gemini(base_url, api_key, model, system, messages, max_tokens):
    url = f"{base_url.rstrip('/')}/models/{model}:generateContent?key={api_key}"
    contents = [
        {"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]}
        for m in messages
    ]
    payload = {"contents": contents, "generationConfig": {"maxOutputTokens": max_tokens}}
    if system:
        payload["systemInstruction"] = {"parts": [{"text": system}]}
    resp = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=90)
    resp.raise_for_status()
    data = resp.json()
    parts = data["candidates"][0]["content"]["parts"]
    return "".join(p.get("text", "") for p in parts)


def call_ai(messages, system="", max_tokens=2048):
    """
    Try each configured provider in priority order until one succeeds.
    Returns: {text, provider, model} or {error, attempts}.
    """
    cfg = load_ai_config()
    providers = cfg.get("providers", [])
    if not providers:
        return {"error": "No AI provider configured. Open Settings and add an API key.", "attempts": []}

    attempts = []
    for p in providers:
        provider = (p.get("provider") or "custom").lower()
        defaults = PROVIDER_DEFAULTS.get(provider, PROVIDER_DEFAULTS["custom"])
        api_key = p.get("apiKey", "")
        model = p.get("model") or defaults["model"]
        base_url = p.get("baseUrl") or defaults["baseUrl"]

        if not api_key:
            attempts.append({"provider": provider, "error": "missing API key"})
            continue
        if not base_url:
            attempts.append({"provider": provider, "error": "this provider needs a Base URL (OpenAI-compatible endpoint)"})
            continue
        if not model:
            attempts.append({"provider": provider, "error": "missing model name"})
            continue

        try:
            print(f"[AI] Trying {provider} · {model}", flush=True)
            if provider == "anthropic":
                text = _call_anthropic(base_url, api_key, model, system, messages, max_tokens)
            elif provider == "gemini":
                text = _call_gemini(base_url, api_key, model, system, messages, max_tokens)
            else:
                extra = {"HTTP-Referer": base_url(), "X-Title": "KAFI Supply Chain Agent"} if provider == "openrouter" else None
                text = _call_openai_compatible(base_url, api_key, model, system, messages, max_tokens, extra)
            if text and text.strip():
                return {"text": text, "provider": provider, "model": model}
            attempts.append({"provider": provider, "error": "empty response"})
        except requests.exceptions.HTTPError as e:
            body = ""
            try:
                body = e.response.text[:300]
            except Exception:
                pass
            attempts.append({"provider": provider, "error": f"HTTP {e.response.status_code}: {body}"})
        except Exception as e:
            attempts.append({"provider": provider, "error": str(e)[:300]})

    return {"error": "All AI providers failed.", "attempts": attempts}


# ═══════════════════════════════════════════════════════════════
#  SOURCING: ENRICHMENT + OUTLOOK (see server_sourcing.py)
# ═══════════════════════════════════════════════════════════════

import server_sourcing as sourcing
import server_vision as vision


# ═══════════════════════════════════════════════════════════════
#  HTTP SERVER
# ═══════════════════════════════════════════════════════════════

class KAFIHandler(SimpleHTTPRequestHandler):
    """Custom handler that serves static files AND API endpoints."""

    def __init__(self, request, client_address, server):
        super().__init__(request, client_address, server, directory=WEB_ROOT)

    def do_POST(self):
        if self.path == "/api/search":
            self._handle_search()
        elif self.path == "/api/scrape":
            self._handle_scrape()
        elif self.path == "/api/analyze-batch":
            self._handle_batch()
        elif self.path == "/api/ai/chat":
            self._handle_ai_chat()
        elif self.path == "/api/ai/config":
            self._handle_ai_config_save()
        elif self.path == "/api/ai/test":
            self._handle_ai_test()
        elif self.path == "/api/enrich/config":
            self._handle_enrich_config_save()
        elif self.path == "/api/enrich/hunter":
            self._handle_enrich_hunter()
        elif self.path == "/api/enrich/apollo":
            self._handle_enrich_apollo()
        elif self.path == "/api/outlook/config":
            self._handle_outlook_config_save()
        elif self.path == "/api/outlook/disconnect":
            self._handle_outlook_disconnect()
        elif self.path == "/api/outlook/send-bulk":
            self._handle_outlook_send_bulk()
        elif self.path == "/api/outlook/device/start":
            self._handle_outlook_device_start()
        elif self.path == "/api/outlook/device/poll":
            self._handle_outlook_device_poll()
        elif self.path == "/api/outlook/smtp/test":
            self._handle_outlook_smtp_test()
        elif self.path == "/api/vision/detect":
            self._handle_vision_detect()
        else:
            self.send_error(404, "API endpoint not found")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        clean_path = parsed.path

        # Never serve secret config files as static assets
        blocked = (
            "/data/ai-config.json", "/data/enrich-config.json",
            "/data/outlook-config.json", "/data/outlook-tokens.json",
            "/data/outlook-device-pending.json",
        )
        if clean_path in blocked or clean_path.rstrip("/").endswith(tuple(blocked)):
            self._send_json({"error": "Forbidden"}, 403)
            return

        if clean_path == "/api/ai/config":
            self._handle_ai_config_get()
            return
        if clean_path == "/api/enrich/config":
            self._handle_enrich_config_get()
            return
        if clean_path == "/api/outlook/config":
            self._handle_outlook_config_get()
            return
        if clean_path == "/api/outlook/connect":
            self._handle_outlook_connect()
            return
        if clean_path == "/api/outlook/callback":
            self._handle_outlook_callback(parsed.query)
            return
        if clean_path == "/api/outlook/status":
            self._handle_outlook_status()
            return
        if clean_path == "/api/vision/status":
            self._handle_vision_status()
            return
        super().do_GET()

    def _is_admin(self):
        return self.headers.get("X-Admin-Password", "") == ADMIN_PASSWORD

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    def end_headers(self):
        self._set_cors_headers()
        super().end_headers()

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Password")

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        return json.loads(raw) if raw else {}

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ── API: Search ──────────────────────────────────────────

    def _handle_search(self):
        if not HAS_SCRAPER:
            self._send_json({"error": "Scraping libraries not installed"}, 500)
            return

        body = self._read_body()
        query = body.get("query", "")
        max_results = body.get("maxResults", 20)

        if not query:
            self._send_json({"error": "Missing 'query' parameter"}, 400)
            return

        print(f"[API] Searching: {query}")
        raw_results = search_duckduckgo(query, max_results=max_results)
        enriched = classify_search_results(raw_results)

        self._send_json({
            "query": query,
            "count": len(enriched),
            "results": enriched,
        })

    # ── API: Scrape Single URL ───────────────────────────────

    def _handle_scrape(self):
        if not HAS_SCRAPER:
            self._send_json({"error": "Scraping libraries not installed"}, 500)
            return

        body = self._read_body()
        url = body.get("url", "")

        if not url:
            self._send_json({"error": "Missing 'url' parameter"}, 400)
            return

        print(f"[API] Scraping: {url}")
        result = scrape_page(url)

        # Don't send raw text back to keep response size small
        result.pop("rawText", None)

        self._send_json(result)

    # ── API: Batch Analyze ───────────────────────────────────

    def _handle_batch(self):
        if not HAS_SCRAPER:
            self._send_json({"error": "Scraping libraries not installed"}, 500)
            return

        body = self._read_body()
        urls = body.get("urls", [])

        if not urls:
            self._send_json({"error": "Missing 'urls' list"}, 400)
            return

        print(f"[API] Batch analyzing {len(urls)} URLs...")
        results = []
        for url in urls[:10]:  # Cap at 10 to prevent abuse
            r = scrape_page(url)
            r.pop("rawText", None)
            results.append(r)

        self._send_json({
            "count": len(results),
            "results": results,
        })

    # ── API: AI Chat (universal, any provider) ───────────────

    def _handle_ai_chat(self):
        body = self._read_body()
        messages = body.get("messages", [])
        system = body.get("system", "")
        max_tokens = min(int(body.get("maxTokens", 2048)), 8192)

        if not messages:
            self._send_json({"error": "Missing 'messages'"}, 400)
            return

        result = call_ai(messages, system=system, max_tokens=max_tokens)
        status = 200 if "text" in result else 502
        self._send_json(result, status)

    # ── API: AI Config (admin only) ──────────────────────────

    def _handle_ai_config_get(self):
        if not self._is_admin():
            self._send_json({"error": "Unauthorized"}, 401)
            return
        cfg = load_ai_config()
        masked = []
        for p in cfg.get("providers", []):
            masked.append({
                "provider": p.get("provider", "custom"),
                "apiKeyMasked": mask_key(p.get("apiKey", "")),
                "model": p.get("model", ""),
                "baseUrl": p.get("baseUrl", ""),
            })
        self._send_json({"providers": masked, "defaults": PROVIDER_DEFAULTS})

    def _handle_ai_config_save(self):
        if not self._is_admin():
            self._send_json({"error": "Unauthorized"}, 401)
            return
        body = self._read_body()
        new_providers = body.get("providers", [])
        old = {i: p for i, p in enumerate(load_ai_config().get("providers", []))}

        cleaned = []
        for i, p in enumerate(new_providers):
            key = p.get("apiKey", "")
            # A masked key means "keep the existing one for this slot"
            if key.startswith("•") and i in old:
                key = old[i].get("apiKey", "")
            cleaned.append({
                "provider": (p.get("provider") or "custom").lower(),
                "apiKey": key,
                "model": p.get("model", ""),
                "baseUrl": p.get("baseUrl", ""),
            })
        save_ai_config({"providers": cleaned})
        print(f"[AI] Config saved: {len(cleaned)} provider(s)", flush=True)
        self._send_json({"ok": True, "count": len(cleaned)})

    def _handle_ai_test(self):
        if not self._is_admin():
            self._send_json({"error": "Unauthorized"}, 401)
            return
        result = call_ai(
            [{"role": "user", "content": "Reply with exactly: KAFI AI online"}],
            system="You are a connectivity test. Reply with exactly what the user asks.",
            max_tokens=20,
        )
        self._send_json(result, 200 if "text" in result else 502)

    # ── API: Enrichment config ─────────────────────────────────

    def _handle_enrich_config_get(self):
        if not self._is_admin():
            self._send_json({"error": "Unauthorized"}, 401)
            return
        cfg = sourcing.load_enrich_config()
        masked = [{
            "provider": p.get("provider", ""),
            "apiKeyMasked": sourcing.mask_key(p.get("apiKey", "")),
            "enabled": p.get("enabled", True),
        } for p in cfg.get("providers", [])]
        self._send_json({"providers": masked, "available": sourcing.ENRICH_PROVIDERS})

    def _handle_enrich_config_save(self):
        if not self._is_admin():
            self._send_json({"error": "Unauthorized"}, 401)
            return
        body = self._read_body()
        new_providers = body.get("providers", [])
        old = {i: p for i, p in enumerate(sourcing.load_enrich_config().get("providers", []))}
        cleaned = []
        for i, p in enumerate(new_providers):
            key = p.get("apiKey", "")
            if key.startswith("•") and i in old:
                key = old[i].get("apiKey", "")
            cleaned.append({
                "provider": (p.get("provider") or "").lower(),
                "apiKey": key,
                "enabled": p.get("enabled", True),
            })
        sourcing.save_enrich_config({"providers": cleaned})
        self._send_json({"ok": True, "count": len(cleaned)})

    def _handle_enrich_hunter(self):
        if not self._is_admin():
            self._send_json({"error": "Unauthorized"}, 401)
            return
        body = self._read_body()
        domain = body.get("domain", "")
        mode = body.get("mode", "domain")
        prov = sourcing.get_enrich_provider("hunter")
        if not prov:
            self._send_json({"error": "Hunter.io API key not configured in Settings"}, 400)
            return
        try:
            if mode == "person" and body.get("firstName") and body.get("lastName"):
                result = sourcing.hunter_email_finder(
                    domain, body["firstName"], body["lastName"], prov["apiKey"])
            else:
                result = sourcing.hunter_domain_search(domain, prov["apiKey"], body.get("limit", 10))
            self._send_json({"ok": True, **result})
        except Exception as e:
            self._send_json({"error": str(e)[:400]}, 502)

    def _handle_enrich_apollo(self):
        if not self._is_admin():
            self._send_json({"error": "Unauthorized"}, 401)
            return
        body = self._read_body()
        prov = sourcing.get_enrich_provider("apollo")
        if not prov:
            self._send_json({"error": "Apollo.io API key not configured in Settings"}, 400)
            return
        try:
            if body.get("searchType") == "org":
                result = sourcing.apollo_org_search(prov["apiKey"], body.get("query", ""), body.get("perPage", 10))
            else:
                result = sourcing.apollo_people_search(
                    prov["apiKey"],
                    query=body.get("query", ""),
                    titles=body.get("titles"),
                    locations=body.get("locations"),
                    per_page=body.get("perPage", 10),
                )
            self._send_json({"ok": True, **result})
        except Exception as e:
            self._send_json({"error": str(e)[:400]}, 502)

    # ── API: Outlook / Microsoft Graph ─────────────────────────

    def _handle_outlook_config_get(self):
        if not self._is_admin():
            self._send_json({"error": "Unauthorized"}, 401)
            return
        cfg = sourcing.load_outlook_config()
        smtp = cfg.get("smtp", {})
        self._send_json({
            "mode": cfg.get("mode", "easy"),
            "clientId": cfg.get("clientId", ""),
            "clientSecretMasked": sourcing.mask_key(cfg.get("clientSecret", "")),
            "tenantId": cfg.get("tenantId", "common"),
            "redirectUri": cfg.get("redirectUri", outlook_callback_url()),
            "smtp": {
                "host": smtp.get("host", "smtp.office365.com"),
                "port": smtp.get("port", 587),
                "email": smtp.get("email", ""),
                "passwordMasked": sourcing.mask_key(smtp.get("password", "")),
                "fromName": smtp.get("fromName", "KAFI Group Exports"),
            },
        })

    def _handle_outlook_config_save(self):
        if not self._is_admin():
            self._send_json({"error": "Unauthorized"}, 401)
            return
        body = self._read_body()
        old = sourcing.load_outlook_config()
        secret = body.get("clientSecret", "")
        if secret.startswith("•"):
            secret = old.get("clientSecret", "")
        old_smtp = old.get("smtp", {})
        smtp_in = body.get("smtp", {})
        smtp_pw = smtp_in.get("password", "")
        if smtp_pw.startswith("•"):
            smtp_pw = old_smtp.get("password", "")
        sourcing.save_outlook_config({
            "mode": (body.get("mode") or "easy").lower(),
            "clientId": body.get("clientId", "").strip(),
            "clientSecret": secret,
            "tenantId": body.get("tenantId", "common").strip() or "common",
            "redirectUri": body.get("redirectUri", outlook_callback_url()).strip(),
            "smtp": {
                "host": smtp_in.get("host", "smtp.office365.com").strip(),
                "port": int(smtp_in.get("port", 587)),
                "email": smtp_in.get("email", "").strip(),
                "password": smtp_pw,
                "fromName": smtp_in.get("fromName", "KAFI Group Exports").strip(),
            },
        })
        self._send_json({"ok": True, "mode": body.get("mode", "easy")})

    def _handle_outlook_connect(self):
        url, state_or_err = sourcing.outlook_auth_url()
        if not url:
            self._send_json({"error": state_or_err}, 400)
            return
        self._send_json({"authUrl": url, "state": state_or_err})

    def _handle_outlook_callback(self, query_string):
        params = urllib.parse.parse_qs(query_string)
        code = (params.get("code") or [None])[0]
        error = (params.get("error") or [None])[0]
        if error:
            self._send_html_redirect(f"/sourcing.html?outlook=error&msg={urllib.parse.quote(error)}")
            return
        if not code:
            self._send_html_redirect("/sourcing.html?outlook=error&msg=no_code")
            return
        try:
            sourcing.outlook_exchange_code(code)
            self._send_html_redirect("/sourcing.html?outlook=connected")
        except Exception as e:
            self._send_html_redirect(f"/sourcing.html?outlook=error&msg={urllib.parse.quote(str(e)[:80])}")

    def _send_html_redirect(self, location):
        self.send_response(302)
        self.send_header("Location", location)
        self.end_headers()

    def _handle_outlook_status(self):
        self._send_json(sourcing.outlook_connection_status())

    def _handle_outlook_device_start(self):
        if not self._is_admin():
            self._send_json({"error": "Unauthorized"}, 401)
            return
        pending, err = sourcing.outlook_device_code_start()
        if err:
            self._send_json({"error": err}, 400)
            return
        self._send_json({"ok": True, **pending})

    def _handle_outlook_device_poll(self):
        if not self._is_admin():
            self._send_json({"error": "Unauthorized"}, 401)
            return
        result, err = sourcing.outlook_device_code_poll()
        if err:
            self._send_json({"error": err}, 400)
            return
        self._send_json(result)

    def _handle_outlook_smtp_test(self):
        if not self._is_admin():
            self._send_json({"error": "Unauthorized"}, 401)
            return
        ok, err = sourcing.smtp_test_connection()
        self._send_json({"ok": ok, "error": err}, 200 if ok else 502)

    def _handle_outlook_disconnect(self):
        if not self._is_admin():
            self._send_json({"error": "Unauthorized"}, 401)
            return
        sourcing.outlook_disconnect()
        self._send_json({"ok": True})

    def _handle_outlook_send_bulk(self):
        if not self._is_admin():
            self._send_json({"error": "Unauthorized"}, 401)
            return
        body = self._read_body()
        recipients = body.get("recipients", [])
        subject = body.get("subject", "")
        html_body = body.get("body", "")
        delay = float(body.get("delaySeconds", 2.0))
        if not recipients or not subject or not html_body:
            self._send_json({"error": "Need recipients, subject, and body"}, 400)
            return
        if len(recipients) > 100:
            self._send_json({"error": "Max 100 recipients per batch"}, 400)
            return
        print(f"[Outlook] Bulk send: {len(recipients)} emails", flush=True)
        result = sourcing.outlook_send_bulk(recipients, subject, html_body, delay_seconds=delay)
        self._send_json({"ok": True, **result})

    def _handle_vision_status(self):
        self._send_json(vision.vision_status())

    def _handle_vision_detect(self):
        body = self._read_body()
        data, status = vision.handle_detect(body)
        self._send_json(data, status)

    def log_message(self, format, *args):
        """Quieter logging — only show API calls, not static file requests."""
        msg = format % args
        if "/api/" in msg or "POST" in msg:
            print(f"  → {msg}")


class DualStackServer(ThreadingHTTPServer):
    """Listen on IPv6 with dual-stack so both http://localhost (::1)
    and 127.0.0.1 work — browsers often try IPv6 first."""
    address_family = socket.AF_INET6

    def server_bind(self):
        with contextlib.suppress(Exception):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


def run_server():
    # ThreadingHTTPServer: browsers hold multiple keep-alive connections,
    # which deadlocks a single-threaded HTTPServer.
    try:
        server = DualStackServer(("::", PORT), KAFIHandler)
    except OSError:
        # IPv6 unavailable — fall back to IPv4 only
        server = ThreadingHTTPServer(("", PORT), KAFIHandler)
    print(f"""
╔══════════════════════════════════════════════════╗
║     KAFI AI Agent — Web Intelligence Server      ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║  All agents — use the dropdown at the top        ║
║                                                  ║
║  Sales Chatbot:     http://localhost:{PORT}/                 ║
║  Supply Chain:      http://localhost:{PORT}/supply-chain.html ║
║  Sourcing Agent:    http://localhost:{PORT}/sourcing.html   ║
║  Warehouse QC (8):  http://localhost:{PORT}/warehouse-qc.html ║
║  Security (10):     http://localhost:{PORT}/security.html   ║
║  Admin Panel:       http://localhost:{PORT}/admin.html      ║
║                                                  ║
║  API Endpoints:                                  ║
║    POST /api/search    — keyword web search      ║
║    POST /api/scrape    — analyze a single URL    ║
║    POST /api/analyze-batch — batch URL analysis  ║
║                                                  ║
╚══════════════════════════════════════════════════╝
    """, flush=True)
    webbrowser.open(f"http://localhost:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
