# UKC Quotation Generator — Duotone Pro Center Urla (Multi-language)

Generate branded PDF quotations ("teklif" / "devis" / "Angebot") for customers
in **English, French, German and Turkish**. The layout, Duotone colors
(Antrasit `#4B4F54` + Duotone Blue `#009EE2`) and fonts stay fixed — you only
edit a small JSON file per customer.

---

## One-time setup

You need Python 3 and the `reportlab` library:

```bash
pip install reportlab
```

The Poppins fonts are bundled in `fonts/` (they render French accents, German
umlauts and Turkish characters correctly), so nothing else is required.

---

## Generating a quote

```bash
# Use the language set in the JSON ("language" field):
python ukc_quote_generator.py quotes/studio3_wingfoil.json

# Force one language:
python ukc_quote_generator.py quotes/studio3_wingfoil.json --lang fr

# Generate ALL four languages at once (EN + FR + DE + TR):
python ukc_quote_generator.py quotes/studio3_wingfoil.json --all
```

Output file names:
* default            -> `studio3_wingfoil.pdf`
* `--lang de`        -> `studio3_wingfoil.de.pdf`
* `--all`            -> `studio3_wingfoil.en.pdf`, `.fr.pdf`, `.de.pdf`, `.tr.pdf`

Supported languages: **en, fr, de, tr**

---

## How translation works

There are two kinds of text in the PDF:

**1. Structural text — translated automatically.**
Section titles, table headers, the word QUOTATION/DEVIS/ANGEBOT/TEKLİF, the
price labels (YOU SAVE / VOUS ÉCONOMISEZ / SIE SPAREN / TASARRUF), schedule
headers and month names all switch with the language. You never write these.

**2. Deal content — you provide it.**
The intro, item descriptions, benefits, terms, etc. Each of these fields can be
written in EITHER of two ways:

* **A plain string** — used for every language. Best for prices and proper
  nouns that don't change:
  ```json
  "regular": "250 EUR"
  ```
* **A per-language object** — different text per language (missing languages
  fall back to English):
  ```json
  "intro": {
    "en": "Thank you for your interest...",
    "fr": "Merci de l'intérêt...",
    "de": "Vielen Dank für Ihr Interesse...",
    "tr": "UKC'ye gösterdiğiniz ilgi için..."
  }
  ```

You can mix both styles freely in the same file. `studio3_wingfoil.json` is a
complete example with all four languages filled in — copy it as your starting
point.

---

## Making a new quote (the normal workflow)

1. Copy `quotes/studio3_wingfoil.json` to a new name, e.g.
   `quotes/ahmet_july.json`.
2. Edit the values. Keep prices as plain strings; translate the prose fields in
   the `{en, fr, de, tr}` objects (or just fill the languages you need).
3. Run:
   ```bash
   python ukc_quote_generator.py quotes/ahmet_july.json --all
   ```

### Field guide

| Field | What it does |
|-------|--------------|
| `language` | Default language when you don't pass `--lang`/`--all`. |
| `brand` | Title, subtitle, website, footer text. Usually leave as-is. |
| `prepared_for` | Optional customer name shown above the intro. Leave `""` to hide. |
| `quote_date` | `""` = today (localized per language). Or `"2026-07-15"` (auto-formatted), or any free text. |
| `intro` | Opening paragraph. |
| `package_items` | Overview table rows: `item`, `details`, `regular`, `cash`. Add/remove as many as you like. |
| `price_summary` | The three big boxes. Values (`regular_total`, `savings`, `cash_price`) + sub-captions. |
| `included` | "What's Included" cards: `title`, `sub`, `desc`. |
| `schedule` | Day-by-day table. Set `"highlight": true` on lesson days to mark them in blue. |
| `benefits` | Two-column benefit cards: `title`, `desc`. |
| `terms` | List of terms & conditions lines. |

### Tips

* **Line breaks inside a cell:** use `\n`, e.g. `"Studio 3\nAccommodation"`.
* **Skip a section:** delete it from the JSON or set it to `[]` — it won't appear. Sections renumber automatically.
* **Currency / numbers:** plain text — write `"675 EUR"`, `"₺25.000"`, `"$450"`, anything.
* **Change a translated label** (e.g. you prefer a different German wording for a
  section title): open `ukc_quote_generator.py` and edit the `LABELS` dictionary
  near the top.

---

## Folder structure

```
ukc_quote_kit/
├── ukc_quote_generator.py     <- the engine (translations live in LABELS at the top)
├── README.md                  <- this file
├── fonts/                     <- Poppins fonts (bundled)
│   └── Poppins-*.ttf
└── quotes/                    <- one JSON per customer (+ generated PDFs)
    └── studio3_wingfoil.json  <- full 4-language example — copy this
```

---

## Troubleshooting

* **"Poppins fonts not found" warning** → keep the `fonts/` folder next to
  `ukc_quote_generator.py`. Without it the PDF still builds but uses Helvetica,
  and accented/Turkish characters may break.
* **`ModuleNotFoundError: reportlab`** → run `pip install reportlab`.
* **JSON error** → check for a missing comma or quote. Paste the file into a
  JSON validator if unsure.
* **A language shows English text** → that field is missing the translation for
  that language; add the language key to the object (it falls back to English).
