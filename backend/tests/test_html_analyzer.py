import unittest

from app.inspection.html_analyzer import detect_pages, internal_links, is_contact_form, match_requirements, parse_html

BASE = "https://shop.example.com/"
HOME = """<html lang="en"><head><title>Sunrise Bakery</title>
<meta name="description" content="Fresh bread"><meta name="viewport" content="width=device-width">
<meta property="og:title" content="Sunrise"><script>var x = "secret-script-text";</script></head>
<body><nav><a href="/about.html">About</a> <a href="/food/">Our Menu</a> <a href="/contact-us">Reach us</a>
<a href="https://other.com/gallery">Gallery</a> <a href="mailto:hi@x.com">Mail</a></nav>
<p>Order online for pickup.</p></body></html>"""
CONTACT = """<form action="/send" method="POST"><input type="hidden" name="csrf"><input name="name">
<input type="email" name="email"><textarea name="message"></textarea><button>Send</button></form>
<form action="/search"><input type="search" name="q"><button>Go</button></form>
<form><input type="email" name="email"><textarea name="message"></textarea><button type="button">Nope</button></form>"""


class AnalyzerTests(unittest.TestCase):
    def test_parse_metadata_and_ignores_scripts(self):
        doc = parse_html(HOME, BASE)
        self.assertEqual((doc["title"], doc["lang"], doc["description"]), ("Sunrise Bakery", "en", "Fresh bread"))
        self.assertTrue(doc["viewport_meta"])
        self.assertEqual(doc["open_graph"], {"og:title": "Sunrise"})
        self.assertNotIn("secret-script-text", doc["text"])
        self.assertTrue(all(l["href"].startswith("http") for l in doc["links"]))

    def test_empty_and_broken_html_do_not_raise(self):
        for html in ["", None, "<html><form><input", "<a href=''>x</a>"]:
            self.assertIn("links", parse_html(html, BASE))

    def test_internal_links_exclude_other_hosts(self):
        links = internal_links(parse_html(HOME, BASE)["links"], BASE)
        self.assertEqual(sorted(l["href"] for l in links), [BASE + "about.html", BASE + "contact-us", BASE + "food/"])

    def test_detect_pages(self):
        links = internal_links(parse_html(HOME, BASE)["links"], BASE)
        res = {r["name"]: r for r in detect_pages(["Home", "About", "Menu", "Contact", "Gallery"], BASE, links)}
        self.assertTrue(res["Home"]["detected"])
        self.assertTrue(res["About"]["detected"], "about.html: the file extension is ignored")
        self.assertTrue(res["Menu"]["detected"], "link text 'Our Menu' is an accepted name for Menu")
        self.assertTrue(res["Contact"]["detected"], "contact-us in the URL")
        self.assertFalse(res["Gallery"]["detected"], "a gallery link to another site must not count")

    def test_linked_page_that_fails_is_not_detected(self):
        links = internal_links(parse_html(HOME, BASE)["links"], BASE)
        res = detect_pages(["About"], BASE, links, {BASE + "about.html": 404})[0]
        self.assertFalse(res["detected"])
        self.assertIn("404", res["evidence"])
        res = detect_pages(["About"], BASE, links, {BASE + "about.html": None})[0]
        self.assertFalse(res["detected"])

    def test_form_detection(self):
        forms = parse_html(CONTACT, BASE + "contact-us")["forms"]
        self.assertEqual([is_contact_form(f) for f in forms], [True, False, False])
        self.assertNotIn("csrf", [f["name"] for f in forms[0]["fields"]])

    def test_requirement_matching(self):
        forms = parse_html(CONTACT, BASE + "contact-us")["forms"]
        meta = {"title": "T", "description": "D"}
        items = [{"id": "a", "kind": "feature", "text": "Contact form"},
                 {"id": "b", "kind": "feature", "text": "Mobile layout"},
                 {"id": "c", "kind": "feature", "text": "Online ordering"},
                 {"id": "d", "kind": "feature", "text": "Newsletter signup"},
                 {"id": "e", "kind": "feature", "text": "SEO basics"}]
        resp = {"checks_run": True, "viewports": [{"name": "Mobile", "width": 390, "height": 844,
                                                   "horizontal_overflow": False, "viewport_meta": True, "error": None}]}
        out = {r["id"]: r for r in match_requirements(items, forms, {BASE: "Order online for pickup."}, resp, meta)}
        self.assertEqual(out["a"]["status"], "detected")
        self.assertEqual(out["b"]["status"], "detected")
        self.assertEqual(out["c"]["status"], "needs_review", "a keyword hit is never proof")
        self.assertEqual(out["d"]["status"], "not_detected")
        self.assertEqual(out["e"]["status"], "detected")
        skipped = match_requirements(items[1:2], forms, {}, {"checks_run": False, "viewports": []}, meta)[0]
        self.assertEqual(skipped["status"], "needs_review", "no responsive data means a person must check")
        self.assertEqual(match_requirements(items[:1], [], {}, resp, meta)[0]["status"], "not_detected")


if __name__ == "__main__":
    unittest.main()
