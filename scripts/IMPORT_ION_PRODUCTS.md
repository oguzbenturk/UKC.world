Import ION Products Script

Overview

This script imports products from a local ION product dump into the Plannivo backend via API calls.

Features

- Scans a directory recursively for `product-import.json` files
- Skips products missing `price` (per request)
- Uploads product images to `/api/upload/images`
- Creates products via `/api/products` (only when `--commit` is passed)
- Runs in dry-run mode by default and writes a report JSON to `scripts/import-ion-products-report.json`

Usage

1) Prepare env variables (recommended via `.env` file):

- ADMIN_EMAIL
- ADMIN_PASSWORD
- API_URL (e.g., https://www.plannivo.com)
- ION_DIR (optional; can be passed with `--ion-dir`)

2) Dry run (default, safe):

```
node ./scripts/import-ion-products.mjs --ion-dir="d:/kspro-plannivo/tools/downloads-ion-duotone/ION" --api-url="https://www.plannivo.com"
```

3) Commit (create products):

```
node ./scripts/import-ion-products.mjs --ion-dir="d:/kspro-plannivo/tools/downloads-ion-duotone/ION" --api-url="https://www.plannivo.com" --commit
```

Options

- `--concurrency=N`  Set concurrency for uploads/creates (default 5)
- `--commit`         Actually create products (without this flag the script is a dry-run)
- `--ion-dir`        Path to the ION folder (overrides env `ION_DIR`)
- `--api-url`        Backend base url (overrides env `API_URL`)

Safety notes

- The script will skip any product where `price` is `null` or missing.
- Images must exist locally under the folder where `product-import.json` is located (e.g., `highres/*`). If no images are found, the product is skipped.
- Run in dry-run first to validate results before using `--commit` to create products in production.

Report

A report is written to `scripts/import-ion-products-report.json` which includes counts and lists of skipped and created products.

If you want, I can:

- Run a dry-run now and share the report, or
- Run with `--commit` after you confirm target environment and credentials.
