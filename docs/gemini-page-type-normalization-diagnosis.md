# Gemini page-type normalization diagnosis

The latest smoke failure was at the adapter boundary: Gemini returned a
`page_type` value that was not one of the five canonical lowercase values, and
the old adapter rejected it before normalization. The exact original value is
not present in the supplied status (only the safe failed path was reported),
so it is not reconstructed here. The failure was before merge and code
generation, in Gemini response/adapter validation.

`services/vision/gemini_schema_adapter.py:normalize_page_type` now runs first.
It trims, lowercases, normalizes separators/whitespace, maps only an explicit
allowlist, and maps unknown values to `generic` with an
`unrecognized-page-type` warning and confidence penalty. Canonical values are
`landing`, `ecommerce`, `dashboard`, `auth`, and `generic`.

Mapped synonyms include landing/page/home/marketing/portfolio terms;
ecommerce/shop/store/product/catalog terms; dashboard/admin/analytics/portal/
workspace terms; auth/login/sign-in/signup/register terms; and generic/
website/webpage/page/unknown/ui/interface/empty terms. Arbitrary categories
never become internal roles.
