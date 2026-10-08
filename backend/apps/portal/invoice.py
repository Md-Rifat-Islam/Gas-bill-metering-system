"""
Customer invoice PDF (reportlab).

Notes
-----
* Currency is written as "BDT" — the built-in PDF fonts (Helvetica) have no
  glyph for the taka sign, which is why it used to render as a black box.
* DTEL logo is left-aligned, DECO logo right-aligned, on the same row.
* Wording mirrors the on-screen bill pages (see frontend utils/billLabels.ts):
  "bKash Charge", kg vs m³ unit price, Conversion Ratio / Final Usage.
"""
from decimal import Decimal

from django.conf import settings
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen import canvas

LEFT = 20 * mm
RIGHT = 190 * mm
CONTENT_W = RIGHT - LEFT

BRAND = colors.HexColor('#1e3a8a')
INK = colors.HexColor('#111827')
MUTED = colors.HexColor('#6b7280')
LINE = colors.HexColor('#d1d5db')
HEAD_BG = colors.HexColor('#f3f4f6')
GREEN = colors.HexColor('#15803d')
AMBER = colors.HexColor('#b45309')
RED = colors.HexColor('#b91c1c')
RED_BG = colors.HexColor('#fef2f2')

STATUS_COLOR = {'Paid': GREEN, 'Partial': AMBER, 'Unpaid': RED}


def money(value) -> str:
    return f"BDT {Decimal(str(value or 0)):,.2f}"


def _load_logo(path):
    """Returns (ImageReader, width_px, height_px) or None if unavailable."""
    try:
        img = ImageReader(str(path))
        w, h = img.getSize()
        return img, w, h
    except Exception:
        return None


def _is_kg_billed(bill) -> bool:
    return bool(getattr(bill, 'conversion_factor', None) and getattr(bill, 'total_usage_kg', None))


def generate_invoice_pdf(bill, fileobj):
    p = canvas.Canvas(fileobj, pagesize=A4)
    width, height = A4

    # ── Header: DTEL (left) · DECO (right), same row ─────────────────────────
    logo_h = 14 * mm
    logo_y = height - 15 * mm - logo_h
    branding = settings.BASE_DIR / 'static' / 'branding'

    dtel = _load_logo(branding / 'dtel-logo.png') or _load_logo(branding / 'dtel-logo.jpeg')
    if dtel:
        img, iw, ih = dtel
        p.drawImage(img, LEFT, logo_y, width=logo_h * iw / ih, height=logo_h,
                    preserveAspectRatio=True, mask='auto')

    deco = _load_logo(branding / 'deco-logo.png')
    if deco:
        img, iw, ih = deco
        w = logo_h * iw / ih
        p.drawImage(img, RIGHT - w, logo_y, width=w, height=logo_h,
                    preserveAspectRatio=True, mask='auto')

    p.setStrokeColor(BRAND)
    p.setLineWidth(1.2)
    p.line(LEFT, logo_y - 4 * mm, RIGHT, logo_y - 4 * mm)

    # ── Title + bill meta ────────────────────────────────────────────────────
    y = logo_y - 16 * mm
    p.setFillColor(BRAND)
    p.setFont('Helvetica-Bold', 22)
    p.drawString(LEFT, y, 'INVOICE')
    p.setFillColor(MUTED)
    p.setFont('Helvetica', 9)
    p.drawString(LEFT, y - 5.5 * mm, 'Utility Billing System')

    p.setFillColor(INK)
    p.setFont('Helvetica-Bold', 11)
    p.drawRightString(RIGHT, y, f"Bill No: {bill.bill_number}")
    p.setFont('Helvetica', 9.5)
    p.setFillColor(MUTED)
    p.drawRightString(RIGHT, y - 5.5 * mm, f"Billing Month: {bill.billing_month.strftime('%B %Y')}")

    # status pill
    status_color = STATUS_COLOR.get(bill.status, MUTED)
    pill_w, pill_h = 24 * mm, 6.5 * mm
    pill_y = y - 14.5 * mm
    p.setFillColor(status_color)
    p.roundRect(RIGHT - pill_w, pill_y, pill_w, pill_h, 3 * mm, stroke=0, fill=1)
    p.setFillColor(colors.white)
    p.setFont('Helvetica-Bold', 9)
    p.drawCentredString(RIGHT - pill_w / 2, pill_y + 2 * mm, str(bill.status).upper())

    y = pill_y - 8 * mm

    # ── helpers ──────────────────────────────────────────────────────────────
    def section(title):
        nonlocal y
        p.setFillColor(HEAD_BG)
        p.rect(LEFT, y - 1.5 * mm, CONTENT_W, 7 * mm, stroke=0, fill=1)
        p.setFillColor(BRAND)
        p.setFont('Helvetica-Bold', 9.5)
        p.drawString(LEFT + 3 * mm, y + 0.8 * mm, title.upper())
        y -= 9 * mm

    def info(label, value, max_w=105 * mm):
        nonlocal y
        p.setFont('Helvetica', 10)
        p.setFillColor(MUTED)
        p.drawString(LEFT + 3 * mm, y, label)
        p.setFillColor(INK)
        p.setFont('Helvetica-Bold', 10)
        lines = simpleSplit(str(value) if value else '-', 'Helvetica-Bold', 10, max_w) or ['-']
        for ln in lines:
            p.drawString(LEFT + 45 * mm, y, ln)
            y -= 5.2 * mm
        y -= 0.8 * mm

    def amount(label, value, *, color=INK, bold=False, size=10, muted=False):
        nonlocal y
        p.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
        p.setFillColor(MUTED if muted else INK)
        p.drawString(LEFT + 3 * mm, y, label)
        p.setFillColor(MUTED if muted else color)
        p.drawRightString(RIGHT - 3 * mm, y, value)
        y -= 6 * mm

    def rule():
        nonlocal y
        p.setStrokeColor(LINE)
        p.setLineWidth(0.5)
        p.line(LEFT, y + 2 * mm, RIGHT, y + 2 * mm)

    # ── Property details ─────────────────────────────────────────────────────
    project = bill.project
    allottee = getattr(getattr(bill.unit, 'allottee', None), 'name', None)

    section('Unit Details')
    info('Project', project.name)
    address = getattr(project, 'address', '') or ''
    if address.strip():
        info('Project Address', address.strip())
    info('Building', bill.building.name)
    info('Unit', bill.unit.unit_no)
    if allottee:
        info('Allottee', allottee)
    y -= 3 * mm

    # ── Meter readings ───────────────────────────────────────────────────────
    kg = _is_kg_billed(bill)
    unit_label = 'kg' if kg else 'm³'

    section('Meter Readings')
    amount('Previous Reading', f"{bill.previous_reading} m³")
    amount('Current Reading', f"{bill.current_reading} m³")
    amount('Consumed', f"{bill.total_usage_m3} m³")
    if kg:
        amount('Conversion Ratio', f"{bill.conversion_factor} kg / m³")
        amount('Final Usage (Billed)', f"{bill.total_usage_kg} kg", bold=True)
    y -= 3 * mm

    # ── Charges ──────────────────────────────────────────────────────────────
    section('Bill Summary')
    amount('Base Amount', money(bill.base_amount))
    amount('Unit Price', f"{money(bill.unit_price)} / {unit_label}", muted=True)
    amount('Service Charge', f"+ {money(bill.service_charge)}")
    if bill.percentage_amount and Decimal(str(bill.percentage_amount)) > 0:
        rate = f"{float(bill.percentage_rate):g}"
        amount(f"bKash Charge ({rate}%)", f"+ {money(bill.percentage_amount)}")
    if bill.extra_charge and Decimal(str(bill.extra_charge)) > 0:
        amount('Extra Charge', f"+ {money(bill.extra_charge)}")
    if bill.late_fee and Decimal(str(bill.late_fee)) > 0:
        amount('Late Fee', f"+ {money(bill.late_fee)}", color=AMBER)
    if bill.discount and Decimal(str(bill.discount)) > 0:
        amount('Discount', f"- {money(bill.discount)}", color=GREEN)

    y += 1 * mm
    p.setStrokeColor(INK)
    p.setLineWidth(1)
    p.line(LEFT, y, RIGHT, y)
    y -= 6.5 * mm

    amount('Total Amount', money(bill.total_amount), bold=True, size=12, color=BRAND)
    amount('Paid Amount', money(bill.paid_amount), color=GREEN)
    y -= 3 * mm

    # Due box
    box_h = 10 * mm
    p.setFillColor(RED_BG)
    p.setStrokeColor(colors.HexColor('#fecaca'))
    p.setLineWidth(0.8)
    p.roundRect(LEFT, y - 3.2 * mm, CONTENT_W, box_h, 2 * mm, stroke=1, fill=1)
    p.setFillColor(RED)
    p.setFont('Helvetica-Bold', 12)
    p.drawString(LEFT + 3 * mm, y + 0.2 * mm, 'Due Amount')
    p.drawRightString(RIGHT - 3 * mm, y + 0.2 * mm, money(bill.due_amount))
    y -= box_h + 2 * mm

    if bill.is_adjusted and bill.adjustment_reason:
        p.setFillColor(AMBER)
        p.setFont('Helvetica-Oblique', 9)
        for ln in simpleSplit(f"Adjustment: {bill.adjustment_reason}", 'Helvetica-Oblique', 9, CONTENT_W):
            p.drawString(LEFT, y, ln)
            y -= 4.5 * mm

    # ── Footer ───────────────────────────────────────────────────────────────
    p.setStrokeColor(LINE)
    p.setLineWidth(0.5)
    p.line(LEFT, 24 * mm, RIGHT, 24 * mm)

    p.setFillColor(MUTED)
    p.setFont('Helvetica', 8)
    p.drawString(LEFT, 19 * mm, f"Generated on {timezone.localtime().strftime('%d %b %Y, %I:%M %p')}")

    p.setFillColor(INK)
    p.setFont('Helvetica-Oblique', 9)
    p.drawRightString(RIGHT, 19 * mm, 'N.B: This is a system generated Bill. So, no signature is required.')

    p.showPage()
    p.save()