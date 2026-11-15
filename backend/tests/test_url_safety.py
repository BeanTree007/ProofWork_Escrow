import unittest

from app.inspection.url_safety import UnsafeUrlError, validate_url


def resolve_to(*ips):
    return lambda host, port: [(2, 1, 6, "", (ip, port)) for ip in ips]


PUBLIC = resolve_to("93.184.216.34")


class UrlSafetyTests(unittest.TestCase):
    def test_public_url_is_allowed(self):
        self.assertEqual(validate_url("https://example.com/path", PUBLIC), "https://example.com/path")

    def test_blocked_inputs(self):
        cases = ["file:///etc/passwd", "ftp://example.com", "javascript:alert(1)", "", "   ", "https://", None,
                 "https://user:pw@example.com", "https://example.com:22", "https://example.com:8080/x",
                 "https://example.com:99999", "http://localhost", "http://printer.local", "https://exa mple.com",
                 "https://example.com/" + "a" * 2100]
        for url in cases:
            with self.subTest(url=str(url)[:40]), self.assertRaises(UnsafeUrlError):
                validate_url(url, PUBLIC)

    def test_private_and_special_addresses_are_blocked(self):
        for ip in ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.9", "169.254.169.254", "0.0.0.0",
                   "100.64.0.1", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1"]:
            with self.subTest(ip=ip), self.assertRaises(UnsafeUrlError):
                validate_url("https://example.com", resolve_to(ip))

    def test_any_private_answer_blocks_the_host(self):
        with self.assertRaises(UnsafeUrlError):
            validate_url("https://example.com", resolve_to("93.184.216.34", "10.0.0.1"))

    def test_ip_literal_urls_are_checked(self):
        with self.assertRaises(UnsafeUrlError):
            validate_url("http://127.0.0.1/", lambda h, p: [(2, 1, 6, "", (h, p))])

    def test_unresolvable_host_is_rejected(self):
        def fail(host, port):
            raise OSError("no such host")
        with self.assertRaises(UnsafeUrlError):
            validate_url("https://nope.example", fail)

    def test_allow_private_still_rejects_bad_schemes_and_credentials(self):
        self.assertEqual(validate_url("http://127.0.0.1:8000/", allow_private=True), "http://127.0.0.1:8000/")
        for url in ["file:///etc/passwd", "http://a:b@127.0.0.1/"]:
            with self.subTest(url=url), self.assertRaises(UnsafeUrlError):
                validate_url(url, allow_private=True)


if __name__ == "__main__":
    unittest.main()
