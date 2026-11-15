# Verification report contract (v1.0)

The inspector produces one JSON document per inspection. The frontend renders it and the
Flask API returns it unchanged. `docs/sample-report.json` is a complete example, and
`backend/app/inspection/contract.py` (`validate_report`) is the source of truth.

**Design rule:** the report is evidence only. It has no verdict, no pass/fail and no payment
recommendation, and `validate_report` rejects keys such as `verdict` or `recommendation`.

## Producing a report

```python
from app.inspection.pipeline import inspect_website

report = inspect_website(
    "https://example.com",
    {"pages": ["Home", "Contact"], "features": ["Contact form", "Mobile layout"]},
    output_dir="path/for/screenshots",   # optional; screenshots are skipped without it
)
```

`inspect_website` always returns a report that passes `validate_report`. Problems with the
site (unreachable, unsafe URL, a tool that is not installed) are recorded inside the report;
they do not raise.

## Sections

| Key | Contents |
|---|---|
| `schema_version`, `generated_at`, `website_url`, `disclaimer` | Metadata. Always show the disclaimer. |
| `reachability` | `reachable`, `final_url`, `status_code`, `response_ms`, `https`, `error` |
| `metadata` | `title`, `description`, `lang`, `viewport_meta`, `open_graph` |
| `pages.required[]` | `name`, `detected`, `matched_url`, `method`, `evidence` for each required page |
| `pages.discovered[]` | Internal pages seen: `url`, `title` |
| `contact_form` | `detected` and `forms[]` with `fields`, `has_email_field`, `has_message_field`, `has_submit` |
| `screenshots[]` | `label`, `viewport`, `page_url`, `file` (bare name), `taken`, `error` |
| `responsiveness` | `checks_run` and `viewports[]` with `horizontal_overflow`, `viewport_meta` |
| `metrics.lighthouse` | `ran`, scores 0 to 100 (`performance`, `accessibility`, `seo`, `best_practices`), `error` |
| `requirements[]` | Checklist: `id`, `kind` (`page` or `feature`), `text`, `status`, `method`, `evidence` |
| `incomplete_checks[]` | Checks that did not run: `check`, `reason` |
| `ai_summary` | `generated_by` (`ai` or `template`), `model` (for example `claude-haiku-5-5`), `text`, `error` |

## Requirement status

- `detected`: automated evidence found it.
- `not_detected`: no evidence was found. This does **not** prove it is absent.
- `needs_review`: the evidence is ambiguous. A person must look.

## Rendering rules for the frontend

- A check that appears in `incomplete_checks` is **not complete**. Show it as "not checked", never as a pass.
- Scores may be `null` when Lighthouse did not run.
- `screenshots[].file` is a bare file name inside the `output_dir` given to the inspector; the API layer decides the URL it is served from.
- `generated_by: "template"` means no AI model wrote the summary. Label it accordingly.
- Text taken from the inspected site (titles, link text, field names) is untrusted. Render it as text, never as HTML.
