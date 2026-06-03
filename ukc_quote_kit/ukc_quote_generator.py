#!/usr/bin/env python3
"""
UKC QUOTATION GENERATOR  --  Duotone Pro Center Urla   (Multi-language)
======================================================================
Generates a branded PDF quotation ("teklif" / "devis" / "Angebot") from a
JSON data file, in English, French, German or Turkish.

USAGE
-----
    python ukc_quote_generator.py <data.json>                # uses "language" in the JSON
    python ukc_quote_generator.py <data.json> --lang fr      # force French
    python ukc_quote_generator.py <data.json> --all          # make EN + FR + DE + TR at once
    python ukc_quote_generator.py <data.json> output.pdf     # custom output name (single language)

Supported languages: en, fr, de, tr

HOW IT WORKS
------------
* Structural text (section titles, table headers, "QUOTATION", "YOU SAVE",
  month names, etc.) is translated automatically by language -- you don't
  write it.
* Deal content (intro, item descriptions, benefits, terms ...) comes from the
  JSON. Each such field may be EITHER:
    - a plain string  -> used for every language (good for prices/proper nouns)
    - an object        -> per-language text, e.g.
        { "en": "Welcome", "fr": "Bienvenue", "de": "Willkommen", "tr": "Hos geldiniz" }
      Missing languages fall back to English.
* Use "\n" inside any text to force a line break in that cell.
* Empty/missing sections are skipped automatically.

Font: Poppins (bundled in ./fonts) renders FR accents, German umlauts and
Turkish characters correctly.
"""

import os
import sys
import json
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SUPPORTED = ["en", "fr", "de", "tr"]

# ──────────────────────────────────────────────────────────────────────────────
# BRAND PALETTE  (Duotone)
# ──────────────────────────────────────────────────────────────────────────────
ANTRASIT      = colors.HexColor("#4B4F54")   # Duotone Antrasit (from ukc.plannivo.com)
ANTRASIT_DK   = colors.HexColor("#383B40")
ANTRASIT_LT   = colors.HexColor("#6B6F75")
DT_BLUE       = colors.HexColor("#009EE2")   # Duotone Blue (accent)
DT_BLUE_DK    = colors.HexColor("#0077B0")
DT_BLUE_TINT  = colors.HexColor("#EAF6FC")
GREY_TEXT     = colors.HexColor("#3A3D42")
GREY_MID      = colors.HexColor("#6B6F75")
ROW_LIGHT     = colors.HexColor("#F4F5F6")
ROW_STRIPE    = colors.HexColor("#FBFBFC")
WHITE         = colors.white
BORDER        = colors.HexColor("#DCDEE1")
BLUE_TXT_SOFT = colors.HexColor("#CDEBF8")
SOFT_BLUE_SUB = colors.HexColor("#DFF3FC")
HEADER_GREY   = colors.HexColor("#C8CACE")
HEADER_GREY2  = colors.HexColor("#A8ABB0")

# ──────────────────────────────────────────────────────────────────────────────
# TRANSLATIONS  (structural / fixed text)
# ──────────────────────────────────────────────────────────────────────────────
LABELS = {
    "en": {
        "quotation": "QUOTATION", "prepared_for": "Prepared for",
        "footer_right": "Contact us to reserve your spot.",
        "sec_overview": "PACKAGE OVERVIEW", "sec_price": "PRICE SUMMARY",
        "sec_included": "WHAT'S INCLUDED", "sec_schedule": "WEEKLY SCHEDULE",
        "sec_benefits": "WHY THIS PACKAGE IS A GREAT DEAL", "sec_terms": "TERMS & CONDITIONS",
        "th_item": "Item", "th_details": "Details", "th_regular": "Regular Price", "th_cash": "Cash Price",
        "ps_regular": "REGULAR TOTAL", "ps_save": "YOU SAVE", "ps_cash": "CASH PRICE",
        "sh_day": "Day", "sh_date": "Date", "sh_activity": "Activity", "sh_rental": "Rental", "sh_cost": "Day Cost",
    },
    "fr": {
        "quotation": "DEVIS", "prepared_for": "Préparé pour",
        "footer_right": "Contactez-nous pour réserver votre place.",
        "sec_overview": "APERÇU DU FORFAIT", "sec_price": "RÉCAPITULATIF DES PRIX",
        "sec_included": "CE QUI EST INCLUS", "sec_schedule": "PROGRAMME DE LA SEMAINE",
        "sec_benefits": "POURQUOI CHOISIR CE FORFAIT", "sec_terms": "CONDITIONS GÉNÉRALES",
        "th_item": "Élément", "th_details": "Détails", "th_regular": "Prix normal", "th_cash": "Prix comptant",
        "ps_regular": "TOTAL NORMAL", "ps_save": "VOUS ÉCONOMISEZ", "ps_cash": "PRIX COMPTANT",
        "sh_day": "Jour", "sh_date": "Date", "sh_activity": "Activité", "sh_rental": "Location", "sh_cost": "Coût/jour",
    },
    "de": {
        "quotation": "ANGEBOT", "prepared_for": "Erstellt für",
        "footer_right": "Kontaktieren Sie uns, um Ihren Platz zu reservieren.",
        "sec_overview": "PAKETÜBERSICHT", "sec_price": "PREISÜBERSICHT",
        "sec_included": "LEISTUNGEN IM ÜBERBLICK", "sec_schedule": "WOCHENPROGRAMM",
        "sec_benefits": "WARUM DIESES PAKET ÜBERZEUGT", "sec_terms": "ALLGEMEINE BEDINGUNGEN",
        "th_item": "Position", "th_details": "Details", "th_regular": "Normalpreis", "th_cash": "Barpreis",
        "ps_regular": "NORMALPREIS", "ps_save": "SIE SPAREN", "ps_cash": "BARPREIS",
        "sh_day": "Tag", "sh_date": "Datum", "sh_activity": "Aktivität", "sh_rental": "Verleih", "sh_cost": "Tageskosten",
    },
    "tr": {
        "quotation": "TEKLİF", "prepared_for": "Sayın",
        "footer_right": "Yerinizi ayırtmak için bizimle iletişime geçin.",
        "sec_overview": "PAKET ÖZETİ", "sec_price": "FİYAT ÖZETİ",
        "sec_included": "NELER DAHİL", "sec_schedule": "HAFTALIK PROGRAM",
        "sec_benefits": "NEDEN BU PAKET", "sec_terms": "ŞARTLAR VE KOŞULLAR",
        "th_item": "Hizmet", "th_details": "Detaylar", "th_regular": "Normal Fiyat", "th_cash": "Nakit Fiyat",
        "ps_regular": "NORMAL TOPLAM", "ps_save": "TASARRUF", "ps_cash": "NAKİT FİYAT",
        "sh_day": "Gün", "sh_date": "Tarih", "sh_activity": "Aktivite", "sh_rental": "Kiralama", "sh_cost": "Günlük Ücret",
    },
}

MONTHS = {
    "en": ["January", "February", "March", "April", "May", "June",
           "July", "August", "September", "October", "November", "December"],
    "fr": ["janvier", "février", "mars", "avril", "mai", "juin",
           "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    "de": ["Januar", "Februar", "März", "April", "Mai", "Juni",
           "Juli", "August", "September", "Oktober", "November", "Dezember"],
    "tr": ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
           "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
}

# ──────────────────────────────────────────────────────────────────────────────
# FONTS
# ──────────────────────────────────────────────────────────────────────────────
def _find_font(filename):
    for d in (os.path.join(SCRIPT_DIR, "fonts"),
              "/usr/share/fonts/truetype/google-fonts"):
        p = os.path.join(d, filename)
        if os.path.exists(p):
            return p
    return None

def _register_fonts():
    table = {
        "Poppins":        "Poppins-Regular.ttf",
        "Poppins-Bold":   "Poppins-Bold.ttf",
        "Poppins-Med":    "Poppins-Medium.ttf",
        "Poppins-Light":  "Poppins-Light.ttf",
        "Poppins-Italic": "Poppins-Italic.ttf",
    }
    ok = True
    for name, fn in table.items():
        p = _find_font(fn)
        if p:
            pdfmetrics.registerFont(TTFont(name, p))
        else:
            ok = False
    return ok

if _register_fonts():
    F_REG, F_BOLD, F_MED, F_LIGHT, F_ITAL = (
        "Poppins", "Poppins-Bold", "Poppins-Med", "Poppins-Light", "Poppins-Italic")
else:
    print("WARNING: Poppins fonts not found in ./fonts -- using Helvetica "
          "(accented / Turkish characters may not render correctly).")
    F_REG, F_BOLD, F_MED, F_LIGHT, F_ITAL = (
        "Helvetica", "Helvetica-Bold", "Helvetica", "Helvetica", "Helvetica-Oblique")

# ──────────────────────────────────────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────────────────────────────────────
def st(name, font=F_REG, size=10, color=GREY_TEXT, align=TA_LEFT, leading=None, **kw):
    return ParagraphStyle(name, fontName=font, fontSize=size, textColor=color,
                          alignment=align, leading=leading or size * 1.4, **kw)

def tr(value, lang, fallback="en"):
    """Resolve a content field that may be a string or a {lang: text} dict."""
    if isinstance(value, dict):
        return value.get(lang) or value.get(fallback) or next(iter(value.values()), "")
    return value if value is not None else ""

def P(text, style):
    """Paragraph that converts \\n in the data into a real line break."""
    return Paragraph(str(text).replace("\n", "<br/>"), style)

def fmt_date(s, lang):
    if not s:
        d = datetime.now()
    else:
        try:
            d = datetime.strptime(str(s), "%Y-%m-%d")
        except (ValueError, TypeError):
            return str(s)  # free-text date -> use as written
    month = MONTHS.get(lang, MONTHS["en"])[d.month - 1]
    if lang == "de":
        return f"{d.day:02d}. {month} {d.year}"
    return f"{d.day:02d} {month} {d.year}"


# ──────────────────────────────────────────────────────────────────────────────
# MAIN BUILDER
# ──────────────────────────────────────────────────────────────────────────────
def build_pdf(data, output_path, lang="en"):
    if lang not in SUPPORTED:
        print(f"WARNING: unsupported language '{lang}', falling back to English.")
        lang = "en"
    L = LABELS[lang]

    def T(v):  # shorthand: translate a content value for the active language
        return tr(v, lang)

    W, H = A4
    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=12 * mm, bottomMargin=12 * mm,
    )
    CW = W - 32 * mm
    story = []

    brand = data.get("brand", {})

    # ── Header ────────────────────────────────────────────────────────────────
    header_inner = [
        [P(T(brand.get("title", "DUOTONE PRO CENTER URLA")),
           st("h1", F_BOLD, 22, WHITE, TA_LEFT)),
         P(f"{L['quotation']}  |  {fmt_date(data.get('quote_date'), lang)}",
           st("h2", F_REG, 9, DT_BLUE, TA_RIGHT))],
        [P(T(brand.get("subtitle", "UKC  -  Urla, Izmir, Turkey")),
           st("h3", F_LIGHT, 9, HEADER_GREY, TA_LEFT)),
         P(T(brand.get("website", "ukc.plannivo.com")),
           st("h4", F_REG, 8, HEADER_GREY2, TA_RIGHT))],
    ]
    th = Table(header_inner, colWidths=[CW * 0.65, CW * 0.35])
    th.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ANTRASIT),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    blue_bar = Table([[""]], colWidths=[CW])
    blue_bar.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), DT_BLUE),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story += [th, blue_bar, Spacer(1, 5 * mm)]

    # ── Prepared-for + intro ────────────────────────────────────────────────────
    if data.get("prepared_for"):
        story.append(P(f"{L['prepared_for']}: <b>{T(data['prepared_for'])}</b>",
                       st("pf", F_REG, 9.5, ANTRASIT, TA_LEFT)))
        story.append(Spacer(1, 2 * mm))
    if data.get("intro"):
        story.append(P(T(data["intro"]), st("intro", F_REG, 9.5, GREY_TEXT, TA_LEFT, leading=15)))
        story.append(Spacer(1, 5 * mm))

    # ── Section header (auto-numbered) ──────────────────────────────────────────
    counter = {"n": 0}
    def section(label, numbered=True):
        if numbered:
            counter["n"] += 1
            title = f"{counter['n']}.  {label}"
        else:
            title = label
        t = Table([[P(title, st("sec", F_BOLD, 10, WHITE, TA_LEFT))]], colWidths=[CW])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), ANTRASIT),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("LINEBELOW", (0, 0), (-1, -1), 2, DT_BLUE),
        ]))
        return t

    # ════════════════════════════════════════════════════════════════════════════
    # 1. PACKAGE OVERVIEW
    # ════════════════════════════════════════════════════════════════════════════
    items = data.get("package_items", [])
    if items:
        story.append(section(L["sec_overview"]))
        story.append(Spacer(1, 2 * mm))

        heads = [L["th_item"], L["th_details"], L["th_regular"], L["th_cash"]]
        rows = [[P(h, st("th", F_BOLD, 9, WHITE, TA_CENTER)) for h in heads]]
        for it in items:
            rows.append([
                P(T(it.get("item", "")),    st("c1", F_BOLD, 9, ANTRASIT, TA_LEFT, leading=13)),
                P(T(it.get("details", "")), st("c2", F_REG, 9, GREY_TEXT, TA_LEFT, leading=13)),
                P(T(it.get("regular", "")), st("c3", F_REG, 9, GREY_MID, TA_CENTER, leading=13)),
                P(T(it.get("cash", "")),    st("c4", F_BOLD, 9, DT_BLUE_DK, TA_CENTER, leading=13)),
            ])
        cw_ov = [CW * f for f in (0.20, 0.38, 0.20, 0.22)]
        t_ov = Table(rows, colWidths=cw_ov, repeatRows=1)
        t_ov.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), ANTRASIT_DK),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [ROW_LIGHT, ROW_STRIPE]),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story += [t_ov, Spacer(1, 5 * mm)]

    # ════════════════════════════════════════════════════════════════════════════
    # 2. PRICE SUMMARY  (nested tables -> perfectly centered values)
    # ════════════════════════════════════════════════════════════════════════════
    ps = data.get("price_summary")
    if ps:
        story.append(section(L["sec_price"]))
        story.append(Spacer(1, 2 * mm))

        def price_cell(label, value, sublabel, bg, val_color, label_color, strike=False):
            val_txt = f"<strike>{value}</strike>" if strike else value
            inner = Table([
                [P(label,   st("pl", F_REG, 8, label_color, TA_CENTER))],
                [P(val_txt, st("pv", F_BOLD, 26, val_color, TA_CENTER, leading=30))],
                [P(sublabel, st("ps", F_REG, 7.5, label_color, TA_CENTER, leading=11))],
            ], colWidths=[(CW / 3) - 1 * mm])
            inner.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("TOPPADDING", (0, 0), (-1, 0), 12),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 12),
                ("TOPPADDING", (0, 1), (-1, 1), 2),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 2),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]))
            return inner

        cell_reg = price_cell(L["ps_regular"], T(ps.get("regular_total", "")),
                              T(ps.get("regular_sub", "")),
                              ROW_LIGHT, ANTRASIT_LT, GREY_MID, strike=True)
        cell_save = price_cell(L["ps_save"], T(ps.get("savings", "")),
                               T(ps.get("savings_sub", "")),
                               ANTRASIT, DT_BLUE, BLUE_TXT_SOFT)
        cell_cash = price_cell(L["ps_cash"], T(ps.get("cash_price", "")),
                               T(ps.get("cash_sub", "")),
                               DT_BLUE, WHITE, SOFT_BLUE_SUB)

        price_row = Table([[cell_reg, cell_save, cell_cash]], colWidths=[CW / 3] * 3)
        price_row.setStyle(TableStyle([
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("GRID", (0, 0), (-1, -1), 1, WHITE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story += [price_row, Spacer(1, 5 * mm)]

    # ════════════════════════════════════════════════════════════════════════════
    # 3. WHAT'S INCLUDED
    # ════════════════════════════════════════════════════════════════════════════
    included = data.get("included", [])
    if included:
        story.append(section(L["sec_included"]))
        story.append(Spacer(1, 2 * mm))

        def label_box(title, sub):
            inner = Table(
                [[P(title, st("it", F_BOLD, 8.5, WHITE, TA_CENTER, leading=11))],
                 [P(sub,   st("is", F_REG, 7, BLUE_TXT_SOFT, TA_CENTER, leading=9.5))]],
                colWidths=[CW * 0.27 - 2 * mm])
            inner.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), ANTRASIT),
                ("TOPPADDING", (0, 0), (-1, 0), 9),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
                ("TOPPADDING", (0, 1), (-1, 1), 0),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LINEBELOW", (0, -1), (-1, -1), 2, DT_BLUE),
            ]))
            return inner

        inc_rows = [[label_box(T(b.get("title", "")), T(b.get("sub", ""))),
                     P(T(b.get("desc", "")), st("id", F_REG, 9, GREY_TEXT, TA_LEFT, leading=14))]
                    for b in included]
        cw_inc = [CW * 0.27, CW * 0.73]
        t_inc = Table(inc_rows, colWidths=cw_inc)
        t_inc.setStyle(TableStyle([
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [ROW_LIGHT, ROW_STRIPE]),
            ("TOPPADDING", (1, 0), (1, -1), 10),
            ("BOTTOMPADDING", (1, 0), (1, -1), 10),
            ("LEFTPADDING", (1, 0), (1, -1), 12),
            ("RIGHTPADDING", (1, 0), (1, -1), 10),
            ("TOPPADDING", (0, 0), (0, -1), 6),
            ("BOTTOMPADDING", (0, 0), (0, -1), 6),
            ("LEFTPADDING", (0, 0), (0, -1), 6),
            ("RIGHTPADDING", (0, 0), (0, -1), 6),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story += [t_inc, Spacer(1, 5 * mm)]

    # ════════════════════════════════════════════════════════════════════════════
    # 4. SCHEDULE
    # ════════════════════════════════════════════════════════════════════════════
    schedule = data.get("schedule", [])
    if schedule:
        story.append(section(L["sec_schedule"]))
        story.append(Spacer(1, 2 * mm))

        sh = [L["sh_day"], L["sh_date"], L["sh_activity"], L["sh_rental"], L["sh_cost"]]
        rows = [[P(h, st("sh", F_BOLD, 8.5, WHITE, TA_CENTER)) for h in sh]]
        highlight_idx = []
        for i, d in enumerate(schedule, start=1):
            cost_color = DT_BLUE_DK if d.get("highlight") else GREY_TEXT
            rows.append([
                P(T(d.get("day", "")),  st("d0", F_REG, 8.5, GREY_TEXT, TA_CENTER, leading=12)),
                P(T(d.get("date", "")), st("d1", F_REG, 8.5, GREY_TEXT, TA_CENTER, leading=12)),
                P(T(d.get("activity", "")), st("d2", F_REG, 8.5, GREY_TEXT, TA_LEFT, leading=12)),
                P(T(d.get("rental", "-")), st("d3", F_REG, 8.5, cost_color, TA_CENTER, leading=12)),
                P(T(d.get("cost", "-")),
                  st("d4", F_BOLD if d.get("highlight") else F_REG, 8.5, cost_color, TA_CENTER, leading=12)),
            ])
            if d.get("highlight"):
                highlight_idx.append(i)

        cw_sc = [CW * f for f in (0.10, 0.11, 0.46, 0.16, 0.17)]
        t_sc = Table(rows, colWidths=cw_sc, repeatRows=1)
        style_cmds = [
            ("BACKGROUND", (0, 0), (-1, 0), ANTRASIT_DK),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [ROW_LIGHT, ROW_STRIPE]),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]
        for ridx in highlight_idx:
            style_cmds += [
                ("BACKGROUND", (0, ridx), (0, ridx), DT_BLUE),
                ("TEXTCOLOR", (0, ridx), (0, ridx), WHITE),
                ("FONTNAME", (0, ridx), (0, ridx), F_BOLD),
            ]
        t_sc.setStyle(TableStyle(style_cmds))
        story.append(t_sc)
        if data.get("schedule_note"):
            story.append(P(T(data["schedule_note"]), st("note", F_ITAL, 7.5, GREY_MID, TA_LEFT)))
        story.append(Spacer(1, 5 * mm))

    # ════════════════════════════════════════════════════════════════════════════
    # 5. BENEFITS  (2-column cards)
    # ════════════════════════════════════════════════════════════════════════════
    benefits = data.get("benefits", [])
    if benefits:
        story.append(section(L["sec_benefits"]))
        story.append(Spacer(1, 2 * mm))

        ben_rows = []
        for i in range(0, len(benefits), 2):
            row = []
            for b in benefits[i:i + 2]:
                inner = Table([
                    [P(T(b.get("title", "")), st("bt", F_BOLD, 8.5, DT_BLUE_DK, TA_LEFT))],
                    [P(T(b.get("desc", "")),  st("bd", F_REG, 8.5, GREY_TEXT, TA_LEFT, leading=13))],
                ], colWidths=[(CW / 2) - 3 * mm])
                inner.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, -1), DT_BLUE_TINT),
                    ("TOPPADDING", (0, 0), (-1, 0), 10),
                    ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
                    ("TOPPADDING", (0, 1), (-1, 1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 3),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("LINEABOVE", (0, 0), (-1, 0), 2.5, DT_BLUE),
                ]))
                row.append(inner)
            if len(row) == 1:
                row.append("")
            ben_rows.append(row)

        t_ben = Table(ben_rows, colWidths=[CW / 2, CW / 2])
        t_ben.setStyle(TableStyle([
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story += [t_ben, Spacer(1, 5 * mm)]

    # ════════════════════════════════════════════════════════════════════════════
    # TERMS  (unnumbered)
    # ════════════════════════════════════════════════════════════════════════════
    terms = data.get("terms", [])
    if terms:
        story.append(section(L["sec_terms"], numbered=False))
        story.append(Spacer(1, 2 * mm))
        for t in terms:
            story.append(P(f"   -  {T(t)}", st("term", F_REG, 8.5, GREY_MID, TA_LEFT, leading=14)))
        story.append(Spacer(1, 5 * mm))

    # ── Footer ──────────────────────────────────────────────────────────────────
    footer_left = brand.get("footer_left", "Duotone Pro Center Urla  (UKC)  |  Urla, Izmir, Turkey")
    footer_right = brand.get("footer_right") or L["footer_right"]
    footer_data = [[
        P(T(footer_left), st("f1", F_BOLD, 8, WHITE, TA_LEFT)),
        P(T(footer_right), st("f2", F_REG, 8, HEADER_GREY, TA_RIGHT)),
    ]]
    t_foot = Table(footer_data, colWidths=[CW * 0.65, CW * 0.35])
    t_foot.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ANTRASIT),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("LINEABOVE", (0, 0), (-1, -1), 3, DT_BLUE),
    ]))
    story.append(t_foot)

    doc.build(story)
    return output_path


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────
def main():
    argv = sys.argv[1:]
    if not argv:
        print(__doc__)
        sys.exit(1)

    do_all = "--all" in argv
    argv = [a for a in argv if a != "--all"]

    lang_override = None
    if "--lang" in argv:
        i = argv.index("--lang")
        try:
            lang_override = argv[i + 1]
        except IndexError:
            print("ERROR: --lang needs a value (en/fr/de/tr).")
            sys.exit(1)
        del argv[i:i + 2]

    if not argv:
        print("ERROR: no data file given.")
        sys.exit(1)

    data_path = argv[0]
    out_arg = argv[1] if len(argv) > 1 else None

    if not os.path.exists(data_path):
        print(f"ERROR: data file not found: {data_path}")
        sys.exit(1)

    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    base_dir = os.path.dirname(data_path) or "."
    base_name = os.path.splitext(os.path.basename(data_path))[0]

    if do_all:
        for lang in SUPPORTED:
            out = os.path.join(base_dir, f"{base_name}.{lang}.pdf")
            build_pdf(data, out, lang)
            print(f"PDF created -> {out}")
    else:
        lang = lang_override or data.get("language", "en")
        if out_arg:
            out = out_arg
        elif lang_override:
            out = os.path.join(base_dir, f"{base_name}.{lang}.pdf")
        else:
            out = os.path.join(base_dir, f"{base_name}.pdf")
        build_pdf(data, out, lang)
        print(f"PDF created -> {out}")


if __name__ == "__main__":
    main()
