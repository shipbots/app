#!/usr/bin/env python3
"""One-time extractor for the ShipBots help-center articles that go on page 2+
of the After-Onboarding Summary. HelpKit (Notion-backed) pages are server-
rendered, so we slice the article body and walk it into ordered blocks
(heading / paragraph / list item / callout / image). Re-run to refresh:

    python3 scripts/extract-help-articles.py

Writes lib/help-articles.ts. Image srcs stay as their original CDN URLs; the
app streams them through /api/help-image at render time.
"""
import html
import json
import re
import urllib.request
from html.parser import HTMLParser

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36"

# platform -> list of (key, title, url)
ARTICLES = {
    "appdot": [
        ("login", "Log into your account",
         "https://help.shipbots.com/your-account/v8Kxw2WLcHZgCR6Pyqq7MW/log-into-your-shipbots-account/nvwrJGTCsNBPrQbFwPKfcw"),
        ("connect", "Connect your e-commerce platform",
         "https://help.shipbots.com/your-account/v8Kxw2WLcHZgCR6Pyqq7MW/connect-your-stores-or-sales-platforms-with-shipbots-/uAPn9JhZQV5fH936JZNqW5"),
        ("inventory", "Send us your inventory",
         "https://help.shipbots.com/your-inventory/aqKxnf3cBT2CiNS2xGsgHD/create-a-po-to-send-your-inventory/76GRZeCiKYc9fYCLvTfmad"),
        ("orders", "Create a manual order",
         "https://help.shipbots.com/your-orders/cMLykrTnrpyCzkTJPJ3T4N/%F0%9F%9B%BB-create-a-manual-order--pick-up-order/uNDsy8ErYZkuFLtfTmr7Uc"),
        ("orders-nav", "How to navigate the orders page",
         "https://help.shipbots.com/your-orders/cMLykrTnrpyCzkTJPJ3T4N/understanding-orders-list-page/v1LWZCQjzM7anqpb1CfbQM"),
    ],
    "portal": [
        ("login", "Log into your account",
         "https://helpportal.shipbots.com/your-account/6jNCBCviCPoG47mCb3pWKQ/log-into-your-shipbots-account/6jNCBCviCPPTxVwo2seNZR"),
        ("connect", "Connect your e-commerce platform",
         "https://helpportal.shipbots.com/your-account/6jNCBCviCPoG47mCb3pWKQ/connect-your-stores-or-sales-platforms-with-shipbots-/6jNCBCviCQAe1PRUaEcFRa"),
        ("inventory", "Send us your inventory",
         "https://helpportal.shipbots.com/your-inventory/6jNCBCviCPJAaQ7aryFg5n/how-do-i-send-inventory-to-shipbots/7vJSfUa34KxGgx3ofL3afd"),
        ("orders", "Create a manual order",
         "https://helpportal.shipbots.com/your-orders/6jNCBCviCPAy3pn2DGMBtS/%F0%9F%9B%BB-create-a-manual-order--pick-up-order/6jNCBCviCQ9irZhFvRRyq7"),
        ("orders-nav", "How to navigate the orders page",
         "https://helpportal.shipbots.com/your-orders/6jNCBCviCPAy3pn2DGMBtS/understanding-orders-list-page/6jNCBCviCQGKnd8HrTp4E3"),
    ],
}

# External guides that are NOT HelpKit articles (e.g. Canva) — added as plain
# links (no fetch/parse). Same URL for both platforms unless noted.
STATIC_EXTRAS = {
    "appdot": [
        ("receiving", "Receiving Guidelines", "https://canva.link/8hhpa6sedxnp1rd"),
    ],
    "portal": [
        ("receiving", "Receiving Guidelines", "https://canva.link/8hhpa6sedxnp1rd"),
    ],
}

IMG_HOSTS = ("https://www.notion.so/image", "https://media.helpkit.co/proxy",
             "https://prod-files-secure.s3")


class ArticleParser(HTMLParser):
    """Walks the sliced article body into ordered blocks."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []
        self.capture = None        # current block type being captured
        self.buf = []              # text buffer for the current block
        self.depth = 0             # element depth inside the current block
        self.in_list = 0           # nesting of notion lists

    def _cls(self, attrs):
        return dict(attrs).get("class", "") or ""

    def handle_starttag(self, tag, attrs):
        cls = self._cls(attrs)
        # Images are leaf nodes — emit immediately (skip logos / non-content).
        if tag == "img":
            src = dict(attrs).get("src", "")
            if src.startswith(IMG_HOSTS):
                self.blocks.append({"type": "img", "src": src})
            return
        if self.capture:
            self.depth += 1
            return
        if "notion-list" in cls:
            self.in_list += 1
        btype = None
        if tag in ("h1", "h2", "h3") or re.search(r"notion-h[123]", cls):
            btype = "h"
        elif "notion-callout-text" in cls:
            btype = "callout"
        elif tag == "li" and self.in_list:
            btype = "li"
        elif "notion-text" in cls:
            btype = "p"
        if btype:
            self.capture = btype
            self.buf = []
            self.depth = 0

    def handle_endtag(self, tag):
        if "notion-list" in "":  # placeholder (lists closed via depth below)
            pass
        if self.capture:
            if self.depth > 0:
                self.depth -= 1
                return
            text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
            if text:
                self.blocks.append({"type": self.capture, "text": text})
            self.capture = None
            self.buf = []
        if tag == "ul" and self.in_list:
            self.in_list -= 1

    def handle_data(self, data):
        if self.capture:
            self.buf.append(data)


def slice_body(html_text):
    start = html_text.find("helpkit-article-wrapper")
    if start == -1:
        return html_text
    # cut the class attr back to the opening tag, then stop at the reactions bar
    start = html_text.rfind("<", 0, start)
    end = html_text.find("helpkit-article-reaction", start)
    if end == -1:
        end = html_text.find("helpkit-related-articles", start)
    if end == -1:
        end = len(html_text)
    return html_text[start:end]


def dedupe(blocks):
    """HelpKit renders a mobile + desktop copy; drop consecutive duplicates."""
    out = []
    seen_imgs = set()
    for b in blocks:
        if b["type"] == "img":
            if b["src"] in seen_imgs:
                continue
            seen_imgs.add(b["src"])
        elif out and out[-1] == b:
            continue
        out.append(b)
    return out


# Non-content strings that leak from the HelpKit chrome.
NOISE = {"shipbots help ai", "was this article helpful?", "table of contents"}


def clean(blocks):
    """Drop the AI-widget label and the leading title-echo heading."""
    blocks = [b for b in blocks
              if b["type"] == "img" or b.get("text", "").strip().lower() not in NOISE]
    if blocks and blocks[0]["type"] == "h":
        blocks = blocks[1:]  # article's own title — we render our own header
    return blocks


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def extract(url):
    body = slice_body(fetch(url))
    p = ArticleParser()
    p.feed(body)
    return clean(dedupe(p.blocks))


def main():
    data = {}
    for platform, items in ARTICLES.items():
        data[platform] = []
        for key, title, url in items:
            blocks = extract(url)
            n_txt = sum(1 for b in blocks if b["type"] != "img")
            n_img = sum(1 for b in blocks if b["type"] == "img")
            print(f"  {platform}/{key}: {n_txt} text + {n_img} img blocks")
            data[platform].append({"key": key, "title": title, "url": url, "blocks": blocks})
        for key, title, url in STATIC_EXTRAS.get(platform, []):
            print(f"  {platform}/{key}: static link (no fetch)")
            data[platform].append({"key": key, "title": title, "url": url, "blocks": []})

    header = (
        "// AUTO-GENERATED by scripts/extract-help-articles.py — do not edit by hand.\n"
        "// Source: ShipBots help centers (help.shipbots.com / helpportal.shipbots.com).\n"
        "// Re-run the script to refresh after the articles change.\n\n"
        "export type HelpBlock =\n"
        "  | { type: 'h' | 'p' | 'li' | 'callout'; text: string }\n"
        "  | { type: 'img'; src: string };\n\n"
        "export interface HelpArticle {\n"
        "  key: string;\n  title: string;\n  url: string;\n  blocks: HelpBlock[];\n}\n\n"
        "export const HELP_ARTICLES: Record<'appdot' | 'portal', HelpArticle[]> =\n"
    )
    ts = header + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    with open("lib/help-articles.ts", "w", encoding="utf-8") as f:
        f.write(ts)
    print("wrote lib/help-articles.ts")


if __name__ == "__main__":
    main()
