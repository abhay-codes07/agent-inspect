# Evidence fixtures

- `evidence.v1.example.json` — Evidence format contract example (6.10-0)
- `xss-corpus.json` — synthetic XSS payloads for HTML escaping regression (6.10-9)
- `demo/` — broken/fixed deterministic Evidence workflow fixtures (6.10-11)
- `malformed/` — tiny synthetic malformed `evidence.json` manifests that `bundle verify` must reject with a stable diagnostic (`manifest_invalid` / `file_missing`)

These fixtures contain no real secrets. XSS strings are intentional attack samples for escaping tests only.
