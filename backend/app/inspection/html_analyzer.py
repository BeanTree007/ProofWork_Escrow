"""Static HTML analysis with BeautifulSoup: metadata, links, forms and requirement matching."""
from __future__ import annotations

import re
from urllib.parse import urldefrag, urljoin, urlsplit

from bs4 import BeautifulSoup

PAGE_SLUGS = {  # accepted link text or URL words per page name, besides the name itself
    "home": ["home", "index"], "about": ["about", "about-us", "our-story"],
    "contact": ["contact", "contact-us", "get-in-touch"], "menu": ["menu", "our-menu"],
    "services": ["services", "our-services", "what-we-do"], "pricing": ["pricing", "plans", "prices"],
    "blog": ["blog", "news", "articles"], "gallery": ["gallery", "photos", "portfolio"],
}
STOPWORDS = {"with", "that", "this", "from", "your", "have", "page", "site", "website", "and", "the", "for"}


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")


def parse_html(html: str, page_url: str) -> dict:
    soup = BeautifulSoup(html or "", "html.parser")
    meta = {str(m.get("name", "")).lower(): m.get("content") or "" for m in soup.find_all("meta") if m.get("name")}
    og = {str(m["property"]): m.get("content") or "" for m in soup.find_all("meta")
          if str(m.get("property", "")).startswith("og:")}
    root = soup.find("html")
    links = []
    for a in soup.find_all("a", href=True):
        href = urldefrag(urljoin(page_url, a["href"].strip()))[0]
        if urlsplit(href).scheme in ("http", "https"):
            links.append({"href": href, "text": " ".join(a.get_text().split())[:120]})
    forms = extract_forms(soup, page_url)
    title = " ".join(soup.title.get_text().split()) if soup.title else None
    for tag in soup(["script", "style", "noscript", "template"]):
        tag.decompose()
    return {
        "title": title[:300] if title else None,
        "description": (meta.get("description") or "")[:500] or None,
        "lang": (root.get("lang") if root else None) or None,
        "viewport_meta": "viewport" in meta,
        "open_graph": dict(list(og.items())[:20]),
        "links": links,
        "forms": forms,
        "text": " ".join(soup.get_text(" ").split())[:20000],
    }


def extract_forms(soup, page_url: str) -> list:
    forms = []
    for form in soup.find_all("form"):
        fields = []
        for el in form.find_all(["input", "textarea", "select"]):
            kind = el.name if el.name in ("textarea", "select") else str(el.get("type") or "text").lower()
            if kind not in ("hidden", "submit", "button", "image", "reset"):
                fields.append({"name": el.get("name") or el.get("id"), "type": kind})
        names = " ".join((f["name"] or "").lower() for f in fields)
        has_submit = bool(form.find("input", attrs={"type": "submit"})) or any(
            str(b.get("type") or "submit").lower() == "submit" for b in form.find_all("button"))
        forms.append({
            "page_url": page_url, "action": form.get("action"), "method": str(form.get("method") or "get").lower(),
            "fields": fields[:30],
            "has_email_field": any(f["type"] == "email" for f in fields) or "email" in names,
            "has_message_field": any(f["type"] == "textarea" for f in fields)
            or bool(re.search(r"message|comment|enquiry|inquiry", names)),
            "has_submit": has_submit,
        })
    return forms


def is_contact_form(form: dict) -> bool:
    return form["has_email_field"] and form["has_message_field"] and form["has_submit"]


def internal_links(links: list, base_url: str) -> list:
    host = urlsplit(base_url).netloc.lower()
    seen, out = set(), []
    for link in links:
        if urlsplit(link["href"]).netloc.lower() == host and link["href"] not in seen:
            seen.add(link["href"])
            out.append(link)
    return out


def _path_slug(href: str) -> str:
    last = urlsplit(href).path.rstrip("/").rsplit("/", 1)[-1]
    return slugify(re.sub(r"\.(html?|php|aspx?)$", "", last, flags=re.I))


def detect_pages(required: list, base_url: str, links: list, statuses: dict | None = None) -> list:
    """Match each required page name against internal links. `statuses` maps URL -> HTTP status if known."""
    statuses = statuses or {}
    results = []
    for name in required:
        key = slugify(name)
        accepted = set(PAGE_SLUGS.get(key, [])) | {key}
        if key == "home":
            results.append({"name": name, "detected": True, "matched_url": base_url, "method": "submitted_url",
                            "evidence": "The submitted URL loaded."})
            continue
        found = next((l for l in links if slugify(l["text"]) in accepted or _path_slug(l["href"]) in accepted), None)
        if not found:
            results.append({"name": name, "detected": False, "matched_url": None, "method": "navigation_link",
                            "evidence": f'No internal link or URL matched "{name}".'})
            continue
        status = statuses.get(found["href"])
        if found["href"] in statuses and (status is None or status >= 400):
            why = f"returned status {status}" if status else "could not be loaded"
            results.append({"name": name, "detected": False, "matched_url": found["href"], "method": "navigation_link",
                            "evidence": f'A link to "{name}" exists but {found["href"]} {why}.'})
        else:
            tail = f", which returned status {status}" if status else ""
            results.append({"name": name, "detected": True, "matched_url": found["href"], "method": "navigation_link",
                            "evidence": f'Link "{found["text"] or name}" points to {found["href"]}{tail}.'})
    return results


def _tokens(text: str) -> list:
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 3 and t not in STOPWORDS]


def match_requirements(items: list, forms: list, texts: dict, responsiveness: dict, metadata: dict) -> list:
    """items: [{"id","kind","text"}]. Returns checklist rows. Never claims more than the evidence shows."""
    out = []
    for item in items:
        low = item["text"].lower()
        status, method, evidence = "needs_review", "keyword", ""
        if ("contact" in low and "form" in low) or "enquiry form" in low or "inquiry form" in low:
            method = "form_structure"
            good = next((f for f in forms if is_contact_form(f)), None)
            if good:
                status = "detected"
                evidence = f'A form on {good["page_url"]} has an email field, a message field and a submit button. Whether it delivers messages was not tested.'
            else:
                status = "not_detected"
                evidence = "No form with an email field, a message field and a submit button was found on the pages checked."
        elif "mobile" in low or "responsive" in low:
            method = "responsive_check"
            mobile = next((v for v in responsiveness.get("viewports", [])
                           if v["width"] <= 480 and v.get("error") is None), None)
            if not responsiveness.get("checks_run") or mobile is None:
                evidence = "The responsive check did not run, so this needs a manual look."
            elif mobile["horizontal_overflow"] is False and mobile["viewport_meta"]:
                status = "detected"
                evidence = f'At {mobile["width"]}px wide there is no horizontal overflow and a viewport tag is present.'
            else:
                evidence = f'At {mobile["width"]}px wide the page shows horizontal overflow or lacks a viewport tag. Review the mobile screenshots.'
        elif re.search(r"\bseo\b|meta (tags?|description)", low):
            method = "metadata"
            has = bool(metadata.get("title")) and bool(metadata.get("description"))
            status = "detected" if has else "not_detected"
            evidence = "A page title and meta description are present." if has else "The page title or meta description is missing."
        else:
            tokens = _tokens(item["text"])
            hit = next(((url, t) for url, body in texts.items() for t in tokens if t in body.lower()), None)
            if hit:
                evidence = f'The text on {hit[0]} mentions "{hit[1]}". Whether it works as required needs a person to check.'
            elif tokens:
                status = "not_detected"
                evidence = "No mention was found in the text of the pages checked. It may still exist in a form the checks cannot see."
            else:
                evidence = "This requirement cannot be checked automatically."
        out.append({"id": item["id"], "kind": item["kind"], "text": item["text"],
                    "status": status, "method": method, "evidence": evidence})
    return out
