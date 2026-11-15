import unittest

from app import create_app


class ApiSkeletonTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()

    def test_health(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok"})

    def test_project_endpoints_fail_explicitly(self):
        endpoints = [
            ("get", "/api/projects"),
            ("post", "/api/projects"),
            ("get", "/api/projects/123"),
            ("post", "/api/projects/123/submission"),
            ("post", "/api/projects/123/inspection"),
            ("get", "/api/projects/123/report"),
            ("get", "/api/projects/123/extensions"),
            ("post", "/api/projects/123/extensions"),
        ]
        for method, path in endpoints:
            with self.subTest(method=method, path=path):
                response = getattr(self.client, method)(path)
                self.assertEqual(response.status_code, 501)
                self.assertEqual(response.get_json()["error"], "Project API is not implemented")


if __name__ == "__main__":
    unittest.main()
