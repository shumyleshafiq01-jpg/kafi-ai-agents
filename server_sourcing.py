"""
KAFI Sourcing Agent — server backends
Enrichment (Apollo, Hunter) + Microsoft Outlook (Graph API) bulk email.
"""

import json
import os
import time
import urllib.parse
import secrets
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import requests

from kafi_paths import data_path, outlook_callback_url

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENRICH_CONFIG_PATH = data_path("enrich-config.json")
OUTLOOK_CONFIG_PATH = data_path("outlook-config.json")
OUTLOOK_TOKENS_PATH = data_path("outlook-tokens.json")
OUTLOOK_DEVICE_PATH = data_path("outlook-device-pending.json")

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
MS_AUTH_BASE = "https://login.microsoftonline.com"


def _read_json(path, default=None):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default if default is not None else {}


def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def mask_key(key):
    if not key:
        return ""
    return ("•" * max(len(key) - 4, 4)) + key[-4:]


# ═══════════════════════════════════════════════════════════════
#  ENRICHMENT CONFIG
# ═══════════════════════════════════════════════════════════════

ENRICH_PROVIDERS = ["apollo", "hunter", "enrich"]


def load_enrich_config():
    cfg = _read_json(ENRICH_CONFIG_PATH, {"providers": []})
    return cfg if isinstance(cfg.get("providers"), list) else {"providers": []}


def save_enrich_config(cfg):
    _write_json(ENRICH_CONFIG_PATH, cfg)


def get_enrich_provider(name):
    for p in load_enrich_config().get("providers", []):
        if (p.get("provider") or "").lower() == name.lower() and p.get("apiKey"):
            return p
    return None


# ═══════════════════════════════════════════════════════════════
#  HUNTER.IO
# ═══════════════════════════════════════════════════════════════

def hunter_domain_search(domain, api_key, limit=10):
    """Find emails at a company domain via Hunter.io."""
    domain = domain.replace("https://", "").replace("http://", "").split("/")[0].strip()
    if domain.startswith("www."):
        domain = domain[4:]
    url = "https://api.hunter.io/v2/domain-search"
    resp = requests.get(url, params={
        "domain": domain,
        "api_key": api_key,
        "limit": limit,
    }, timeout=30)
    resp.raise_for_status()
    data = resp.json().get("data", {})
    emails = []
    for e in data.get("emails", []):
        emails.append({
            "email": e.get("value", ""),
            "type": e.get("type", ""),
            "confidence": e.get("confidence"),
            "firstName": e.get("first_name", ""),
            "lastName": e.get("last_name", ""),
            "position": e.get("position", ""),
            "seniority": e.get("seniority", ""),
        })
    return {
        "domain": domain,
        "organization": data.get("organization", ""),
        "emails": emails,
        "pattern": data.get("pattern", ""),
    }


def hunter_email_finder(domain, first_name, last_name, api_key):
    url = "https://api.hunter.io/v2/email-finder"
    resp = requests.get(url, params={
        "domain": domain,
        "first_name": first_name,
        "last_name": last_name,
        "api_key": api_key,
    }, timeout=30)
    resp.raise_for_status()
    d = resp.json().get("data", {})
    return {
        "email": d.get("email", ""),
        "score": d.get("score"),
        "position": d.get("position", ""),
    }


# ═══════════════════════════════════════════════════════════════
#  APOLLO.IO
# ═══════════════════════════════════════════════════════════════

def apollo_people_search(api_key, query="", titles=None, locations=None, per_page=10):
    """
    Search Apollo people database. Requires Apollo API key (paid/free tier).
    """
    url = "https://api.apollo.io/v1/mixed_people/search"
    payload = {
        "q_keywords": query,
        "per_page": min(per_page, 25),
        "page": 1,
    }
    if titles:
        payload["person_titles"] = titles
    if locations:
        payload["person_locations"] = locations

    resp = requests.post(url, headers={
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": api_key,
    }, json=payload, timeout=45)
    resp.raise_for_status()
    people = resp.json().get("people", [])
    results = []
    for p in people:
        org = p.get("organization") or {}
        results.append({
            "name": p.get("name", ""),
            "firstName": p.get("first_name", ""),
            "lastName": p.get("last_name", ""),
            "email": p.get("email", ""),
            "title": p.get("title", ""),
            "company": org.get("name", ""),
            "linkedinUrl": p.get("linkedin_url", ""),
            "city": p.get("city", ""),
            "country": p.get("country", ""),
        })
    return {"count": len(results), "people": results}


def apollo_org_search(api_key, query, per_page=10):
    url = "https://api.apollo.io/v1/mixed_companies/search"
    payload = {"q_organization_name": query, "per_page": min(per_page, 25), "page": 1}
    resp = requests.post(url, headers={
        "Content-Type": "application/json",
        "X-Api-Key": api_key,
    }, json=payload, timeout=45)
    resp.raise_for_status()
    orgs = resp.json().get("organizations", [])
    return {
        "count": len(orgs),
        "organizations": [{
            "name": o.get("name", ""),
            "domain": o.get("primary_domain", ""),
            "industry": o.get("industry", ""),
            "country": o.get("country", ""),
            "linkedinUrl": o.get("linkedin_url", ""),
        } for o in orgs],
    }


# ═══════════════════════════════════════════════════════════════
#  MICROSOFT OUTLOOK / GRAPH API
# ═══════════════════════════════════════════════════════════════

OUTLOOK_SCOPES = "offline_access User.Read Mail.Send"


def load_outlook_config():
    return _read_json(OUTLOOK_CONFIG_PATH, {
        "mode": "easy",  # easy | azure | smtp
        "clientId": "",
        "clientSecret": "",
        "tenantId": "common",
        "redirectUri": outlook_callback_url(),
        "smtp": {
            "host": "smtp.office365.com",
            "port": 587,
            "email": "",
            "password": "",
            "fromName": "KAFI Group Exports",
        },
    })


def get_outlook_mode():
    return (load_outlook_config().get("mode") or "easy").lower()


def _token_request_data(refresh=False, code=None, device_code=None):
    """Build OAuth token request — public client (easy) omits client_secret."""
    cfg = load_outlook_config()
    tenant = cfg.get("tenantId") or "common"
    token_url = f"{MS_AUTH_BASE}/{tenant}/oauth2/v2.0/token"
    data = {"client_id": cfg["clientId"], "scope": OUTLOOK_SCOPES}
    if cfg.get("clientSecret"):
        data["client_secret"] = cfg["clientSecret"]
    if device_code:
        data["grant_type"] = "urn:ietf:params:oauth:grant-type:device_code"
        data["device_code"] = device_code
    elif refresh:
        tokens = load_outlook_tokens()
        data["grant_type"] = "refresh_token"
        data["refresh_token"] = tokens.get("refresh_token", "")
    elif code:
        data["grant_type"] = "authorization_code"
        data["code"] = code
        data["redirect_uri"] = cfg.get("redirectUri", outlook_callback_url())
    return token_url, data


def _save_tokens_from_response(resp_json):
    tokens = resp_json
    tokens["saved_at"] = int(time.time())
    tokens["expires_at"] = int(time.time()) + int(tokens.get("expires_in", 3600))
    tokens["mode"] = get_outlook_mode()
    save_outlook_tokens(tokens)
    return tokens


# ── Mode A: Easy Connect (device code — no secret, no redirect) ──

def outlook_device_code_start():
    """
    Device code flow: user visits microsoft.com/devicelogin and signs in.
    Requires Azure app with 'Allow public client flows' enabled (one-time IT setup).
    """
    cfg = load_outlook_config()
    if not cfg.get("clientId"):
        return None, "Add Client ID first (one-time Azure app registration)"
    tenant = cfg.get("tenantId") or "common"
    url = f"{MS_AUTH_BASE}/{tenant}/oauth2/v2.0/devicecode"
    resp = requests.post(url, data={
        "client_id": cfg["clientId"],
        "scope": OUTLOOK_SCOPES,
    }, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    pending = {
        "device_code": data["device_code"],
        "user_code": data["user_code"],
        "verification_uri": data.get("verification_uri", "https://microsoft.com/devicelogin"),
        "expires_at": int(time.time()) + int(data.get("expires_in", 900)),
        "interval": int(data.get("interval", 5)),
        "message": data.get("message", ""),
    }
    _write_json(OUTLOOK_DEVICE_PATH, pending)
    return pending, None


def outlook_device_code_poll():
    """Poll until user completes sign-in at microsoft.com/devicelogin."""
    pending = _read_json(OUTLOOK_DEVICE_PATH, {})
    if not pending.get("device_code"):
        return None, "No sign-in in progress — click Connect first"
    if pending.get("expires_at", 0) < int(time.time()):
        return None, "Sign-in code expired — click Connect again"

    token_url, data = _token_request_data(device_code=pending["device_code"])
    resp = requests.post(token_url, data=data, timeout=30)
    body = resp.json()

    if resp.status_code == 200:
        _save_tokens_from_response(body)
        if os.path.exists(OUTLOOK_DEVICE_PATH):
            os.remove(OUTLOOK_DEVICE_PATH)
        return {"connected": True}, None

    err = body.get("error", "")
    if err == "authorization_pending":
        return {"pending": True}, None
    if err == "slow_down":
        return {"pending": True, "slowDown": True}, None
    return None, body.get("error_description") or err or "Sign-in failed"


def save_outlook_config(cfg):
    _write_json(OUTLOOK_CONFIG_PATH, cfg)


def load_outlook_tokens():
    return _read_json(OUTLOOK_TOKENS_PATH, {})


def save_outlook_tokens(tokens):
    _write_json(OUTLOOK_TOKENS_PATH, tokens)


def outlook_auth_url(state=None):
    cfg = load_outlook_config()
    if not cfg.get("clientId"):
        return None, "Outlook not configured — add Azure Client ID in Settings"
    tenant = cfg.get("tenantId") or "common"
    state = state or secrets.token_urlsafe(16)
    params = urllib.parse.urlencode({
        "client_id": cfg["clientId"],
        "response_type": "code",
        "redirect_uri": cfg.get("redirectUri", outlook_callback_url()),
        "scope": OUTLOOK_SCOPES,
        "response_mode": "query",
        "state": state,
    })
    return f"{MS_AUTH_BASE}/{tenant}/oauth2/v2.0/authorize?{params}", state


def outlook_exchange_code(code):
    token_url, data = _token_request_data(code=code)
    resp = requests.post(token_url, data=data, timeout=30)
    resp.raise_for_status()
    return _save_tokens_from_response(resp.json())


def outlook_refresh_tokens():
    tokens = load_outlook_tokens()
    if not tokens.get("refresh_token") and not tokens.get("access_token"):
        return None, "Not connected to Outlook"
    if tokens.get("expires_at", 0) > int(time.time()) + 120:
        return tokens, None

    token_url, data = _token_request_data(refresh=True)
    resp = requests.post(token_url, data=data, timeout=30)
    resp.raise_for_status()
    new_tokens = resp.json()
    new_tokens["refresh_token"] = new_tokens.get("refresh_token") or tokens.get("refresh_token")
    return _save_tokens_from_response(new_tokens), None


def outlook_get_profile():
    tokens, err = outlook_refresh_tokens()
    if err:
        return None, err
    resp = requests.get(f"{GRAPH_BASE}/me", headers={
        "Authorization": f"Bearer {tokens['access_token']}",
    }, timeout=20)
    resp.raise_for_status()
    return resp.json(), None


def outlook_send_mail(to_email, subject, body_html, body_text=None):
    """Send one email via Microsoft Graph from the connected mailbox."""
    tokens, err = outlook_refresh_tokens()
    if err:
        return False, err

    message = {
        "message": {
            "subject": subject,
            "body": {
                "contentType": "HTML",
                "content": body_html,
            },
            "toRecipients": [{"emailAddress": {"address": to_email}}],
        },
        "saveToSentItems": True,
    }

    resp = requests.post(
        f"{GRAPH_BASE}/me/sendMail",
        headers={
            "Authorization": f"Bearer {tokens['access_token']}",
            "Content-Type": "application/json",
        },
        json=message,
        timeout=30,
    )
    if resp.status_code not in (200, 202):
        return False, f"Graph API {resp.status_code}: {resp.text[:300]}"
    return True, None


def outlook_send_bulk(recipients, subject_template, body_template, delay_seconds=2.0):
    """Route bulk send to Graph API or SMTP based on active mode."""
    mode = get_outlook_mode()
    if mode == "smtp":
        return smtp_send_bulk(recipients, subject_template, body_template, delay_seconds)
    return graph_send_bulk(recipients, subject_template, body_template, delay_seconds)


def graph_send_bulk(recipients, subject_template, body_template, delay_seconds=2.0):
    """
    Send personalized bulk emails. Templates support {{name}}, {{company}}, {{position}}.
    Returns list of {email, ok, error}.
    """
    results = []
    for i, r in enumerate(recipients):
        email = (r.get("email") or "").strip()
        if not email:
            results.append({"email": "", "ok": False, "error": "no email"})
            continue

        subs = {
            "name": r.get("name", ""),
            "company": r.get("company", ""),
            "position": r.get("position", ""),
            "firstName": r.get("firstName", r.get("name", "").split()[0] if r.get("name") else ""),
        }
        subject = subject_template
        body = body_template
        for k, v in subs.items():
            subject = subject.replace("{{" + k + "}}", v or "")
            body = body.replace("{{" + k + "}}", v or "")

        ok, err = outlook_send_mail(email, subject, body.replace("\n", "<br>"))
        results.append({"email": email, "name": r.get("name", ""), "ok": ok, "error": err})
        if i < len(recipients) - 1 and delay_seconds > 0:
            time.sleep(delay_seconds)
    sent = sum(1 for x in results if x["ok"])
    return {"sent": sent, "failed": len(results) - sent, "results": results}


def outlook_disconnect():
    if os.path.exists(OUTLOOK_TOKENS_PATH):
        os.remove(OUTLOOK_TOKENS_PATH)
    if os.path.exists(OUTLOOK_DEVICE_PATH):
        os.remove(OUTLOOK_DEVICE_PATH)
    return True


def outlook_connection_status():
    mode = get_outlook_mode()
    if mode == "smtp":
        cfg = load_outlook_config()
        smtp = cfg.get("smtp", {})
        if smtp.get("email") and smtp.get("password"):
            return {
                "connected": True,
                "mode": "smtp",
                "email": smtp.get("email"),
                "displayName": smtp.get("fromName", ""),
            }
        return {"connected": False, "mode": "smtp", "error": "SMTP email/password not configured"}

    tokens = load_outlook_tokens()
    if not tokens.get("access_token") and not tokens.get("refresh_token"):
        return {"connected": False, "mode": mode}
    profile, err = outlook_get_profile()
    if err:
        return {"connected": False, "mode": mode, "error": err}
    return {
        "connected": True,
        "mode": mode,
        "email": profile.get("mail") or profile.get("userPrincipalName", ""),
        "displayName": profile.get("displayName", ""),
    }


# ═══════════════════════════════════════════════════════════════
#  MODE C: SMTP (email + app password — no Azure for daily use)
# ═══════════════════════════════════════════════════════════════

def smtp_send_one(cfg, to_email, subject, body_html):
    smtp_cfg = cfg.get("smtp", {})
    host = smtp_cfg.get("host", "smtp.office365.com")
    port = int(smtp_cfg.get("port", 587))
    user = smtp_cfg.get("email", "")
    password = smtp_cfg.get("password", "")
    from_name = smtp_cfg.get("fromName", "KAFI Group")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{user}>"
    msg["To"] = to_email
    msg.attach(MIMEText(body_html, "html"))

    with smtplib.SMTP(host, port, timeout=30) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(user, password)
        server.sendmail(user, [to_email], msg.as_string())
    return True, None


def smtp_test_connection():
    cfg = load_outlook_config()
    smtp_cfg = cfg.get("smtp", {})
    if not smtp_cfg.get("email") or not smtp_cfg.get("password"):
        return False, "Enter SMTP email and password"
    try:
        host = smtp_cfg.get("host", "smtp.office365.com")
        port = int(smtp_cfg.get("port", 587))
        with smtplib.SMTP(host, port, timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_cfg["email"], smtp_cfg["password"])
        return True, None
    except Exception as e:
        return False, str(e)[:300]


def smtp_send_bulk(recipients, subject_template, body_template, delay_seconds=2.0):
    cfg = load_outlook_config()
    results = []
    for i, r in enumerate(recipients):
        email = (r.get("email") or "").strip()
        if not email:
            results.append({"email": "", "ok": False, "error": "no email"})
            continue
        subs = {
            "name": r.get("name", ""),
            "company": r.get("company", ""),
            "position": r.get("position", ""),
            "firstName": r.get("firstName", r.get("name", "").split()[0] if r.get("name") else ""),
        }
        subject, body = subject_template, body_template
        for k, v in subs.items():
            subject = subject.replace("{{" + k + "}}", v or "")
            body = body.replace("{{" + k + "}}", v or "")
        try:
            smtp_send_one(cfg, email, subject, body.replace("\n", "<br>"))
            results.append({"email": email, "name": r.get("name", ""), "ok": True, "error": None})
        except Exception as e:
            results.append({"email": email, "name": r.get("name", ""), "ok": False, "error": str(e)[:200]})
        if i < len(recipients) - 1 and delay_seconds > 0:
            time.sleep(delay_seconds)
    sent = sum(1 for x in results if x["ok"])
    return {"sent": sent, "failed": len(results) - sent, "results": results}
