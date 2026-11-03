"""
Generic Excel/PDF export helpers for Billing, Payments, and Meter readings.
Each export respects date/filter params and builds a clean, styled file.
"""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from decimal import Decimal
import io
import os

FONT_NAME = 'Arial'
HEADER_FILL = PatternFill('solid', start_color='1F4E78', end_color='1F4E78')
HEADER_FONT = Font(name=FONT_NAME, bold=True, color='FFFFFF', size=10)
TITLE_FONT  = Font(name=FONT_NAME, bold=True, size=12)
NORMAL_FONT = Font(name=FONT_NAME, size=10)
TOTAL_FONT  = Font(name=FONT_NAME, bold=True, size=10)
TOTAL_FILL  = PatternFill('solid', start_color='D9E1F2', end_color='D9E1F2')
THIN        = Side(style='thin', color='B7B7B7')
BORDER      = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
CENTER      = Alignment(horizontal='center', vertical='center', wrap_text=True)
LEFT        = Alignment(horizontal='left',   vertical='center')
RIGHT       = Alignment(horizontal='right',  vertical='center')
CURRENCY    = '#,##0.00'
DATE_FMT    = 'DD-MMM-YYYY'


def _style(cell, font=None, fill=None, align=None, num_fmt=None):
    if font:    cell.font   = font
    if fill:    cell.fill   = fill
    if align:   cell.alignment = align
    if num_fmt: cell.number_format = num_fmt
    cell.border = BORDER


def _title_row(ws, title: str, col_count: int, row: int = 1):
    # merge_cells on a single column is invalid in some viewers; only merge
    # when the export actually has more than one column.
    if col_count > 1:
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=col_count)
    c = ws.cell(row=row, column=1, value=title)
    c.font = TITLE_FONT
    c.alignment = CENTER
    ws.row_dimensions[row].height = 22


def _header_row(ws, headers: list, row: int = 2):
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=row, column=col, value=h)
        _style(c, font=HEADER_FONT, fill=HEADER_FILL, align=CENTER)
    ws.row_dimensions[row].height = 28


# ── Bills: selectable column registry ─────────────────────────────────────────
# Single source of truth for BOTH the Excel and PDF bill exports. `key` is
# what the frontend's column picker sends (keep it in sync with
# BILL_EXPORT_COLUMNS in frontend ExportBillsModal.tsx). Order here is the
# order columns appear in the file, regardless of the order they were
# ticked in the UI.
#   kind:  'index' | 'text' | 'num3' | 'pct' | 'money'
#   align: 'left' | 'center' (numeric kinds are always right-aligned)
#   total: True → this column gets a grand total in the totals row
def _unit_attr(bill, name, default=''):
    return getattr(bill.unit, name, default) if bill.unit else default


BILL_EXPORT_COLUMNS = [
    {'key': 'sl',                'label': 'SL',               'width': 5,  'kind': 'index', 'align': 'center'},
    {'key': 'bill_number',       'label': 'Bill No.',         'width': 14, 'kind': 'text',  'align': 'center',
     'get': lambda b: b.bill_number},
    {'key': 'billing_month',     'label': 'Billing Month',    'width': 14, 'kind': 'text',  'align': 'center',
     'get': lambda b: b.billing_month.strftime('%B %Y')},
    {'key': 'project',           'label': 'Project',          'width': 18, 'kind': 'text',  'align': 'left',
     'get': lambda b: b.project.name if b.project else ''},
    {'key': 'building',          'label': 'Building',         'width': 16, 'kind': 'text',  'align': 'left',
     'get': lambda b: b.building.name if b.building else ''},
    {'key': 'unit',              'label': 'Unit',             'width': 8,  'kind': 'text',  'align': 'center',
     'get': lambda b: _unit_attr(b, 'unit_no')},
    {'key': 'floor',             'label': 'Floor',            'width': 7,  'kind': 'text',  'align': 'center',
     'get': lambda b: _unit_attr(b, 'floor_no')},
    {'key': 'allottee',          'label': 'Allottee',         'width': 20, 'kind': 'text',  'align': 'left',
     'get': lambda b: getattr(getattr(b.unit, 'allottee', None), 'name', '') or ''},
    {'key': 'meter_no',          'label': 'Meter No.',        'width': 16, 'kind': 'text',  'align': 'center',
     'get': lambda b: _unit_attr(b, 'meter_no')},
    {'key': 'previous_reading',  'label': 'Prev. Reading',    'width': 12, 'kind': 'num3',
     'get': lambda b: float(b.previous_reading or 0)},
    {'key': 'current_reading',   'label': 'Curr. Reading',    'width': 12, 'kind': 'num3',
     'get': lambda b: float(b.current_reading or 0)},
    {'key': 'usage_m3',          'label': 'Usage (m³)',       'width': 11, 'kind': 'num3',
     'get': lambda b: float(b.total_usage_m3 or 0)},
    {'key': 'usage_kg',          'label': 'Usage (Kg)',       'width': 11, 'kind': 'num3',
     'get': lambda b: float(b.total_usage_kg or 0) if b.total_usage_kg else 0},
    {'key': 'unit_price',        'label': 'Unit Price',       'width': 11, 'kind': 'money',
     'get': lambda b: float(b.unit_price or 0)},
    {'key': 'base_amount',       'label': 'Base Amount',      'width': 12, 'kind': 'money',
     'get': lambda b: float(b.base_amount or 0)},
    {'key': 'service_charge',    'label': 'Service Charge',   'width': 13, 'kind': 'money',
     'get': lambda b: float(b.service_charge or 0)},
    {'key': 'percentage_rate',   'label': 'Percentage (%)',   'width': 9,  'kind': 'pct',
     'get': lambda b: float(b.percentage_rate or 0)},
    {'key': 'percentage_amount', 'label': 'Percentage Charge', 'width': 13, 'kind': 'money',
     'get': lambda b: float(b.percentage_amount or 0)},
    {'key': 'extra_charge',      'label': 'Extra Charge',     'width': 12, 'kind': 'money',
     'get': lambda b: float(b.extra_charge or 0)},
    {'key': 'discount',          'label': 'Discount',         'width': 11, 'kind': 'money',
     'get': lambda b: float(b.discount or 0)},
    {'key': 'late_fee',          'label': 'Late Fee',         'width': 11, 'kind': 'money',
     'get': lambda b: float(b.late_fee or 0)},
    {'key': 'total_amount',      'label': 'Total Amount',     'width': 13, 'kind': 'money', 'total': True,
     'get': lambda b: float(b.total_amount or 0)},
    {'key': 'paid_amount',       'label': 'Paid',             'width': 12, 'kind': 'money', 'total': True,
     'get': lambda b: float(b.paid_amount or 0)},
    {'key': 'due_amount',        'label': 'Due',              'width': 12, 'kind': 'money', 'total': True,
     'get': lambda b: float(b.due_amount or 0)},
    {'key': 'status',            'label': 'Status',           'width': 10, 'kind': 'text',  'align': 'center',
     'get': lambda b: b.status},
    {'key': 'created',           'label': 'Created',          'width': 12, 'kind': 'text',  'align': 'center',
     'get': lambda b: b.created_at.strftime('%d-%b-%Y') if b.created_at else ''},
]

BILL_EXPORT_COLUMN_KEYS = [c['key'] for c in BILL_EXPORT_COLUMNS]


def resolve_bill_columns(keys=None):
    """
    Turn a list of requested column keys into the column definitions to
    export, in canonical order. None/empty → every column (the old
    behaviour, so existing callers keep working). Unknown keys raise
    ValueError so the view can answer 400 instead of silently exporting
    something different from what was asked for.
    """
    if not keys:
        return list(BILL_EXPORT_COLUMNS)
    unknown = [k for k in keys if k not in BILL_EXPORT_COLUMN_KEYS]
    if unknown:
        raise ValueError(f"Unknown export column(s): {', '.join(unknown)}")
    wanted = set(keys)
    return [c for c in BILL_EXPORT_COLUMNS if c['key'] in wanted]


def _bill_value(bill, col, sl):
    return sl if col['kind'] == 'index' else col['get'](bill)


def export_bills_excel(bills_qs, title='Billing Export', columns=None) -> bytes:
    cols = resolve_bill_columns(columns)

    wb = Workbook()
    ws = wb.active
    ws.title = 'Bills'

    _title_row(ws, title, len(cols))
    _header_row(ws, [c['label'] for c in cols])
    for i, c in enumerate(cols, 1):
        ws.column_dimensions[get_column_letter(i)].width = c['width']

    totals = {c['key']: Decimal('0') for c in cols if c.get('total')}
    sl = 0
    for sl, bill in enumerate(bills_qs, start=1):
        r = sl + 2
        for ci, c in enumerate(cols, 1):
            cell = ws.cell(row=r, column=ci, value=_bill_value(bill, c, sl))
            kind = c['kind']
            if kind == 'num3':
                _style(cell, font=NORMAL_FONT, align=RIGHT, num_fmt='#,##0.000')
            elif kind == 'pct':
                _style(cell, font=NORMAL_FONT, align=RIGHT, num_fmt='0.00')
            elif kind == 'money':
                _style(cell, font=NORMAL_FONT, align=RIGHT, num_fmt=CURRENCY)
            else:
                _style(cell, font=NORMAL_FONT, align=LEFT if c.get('align') == 'left' else CENTER)
        for key in totals:
            totals[key] += Decimal(str(c_val(bill, key)))

    # Totals row
    tr = sl + 3
    for ci in range(1, len(cols) + 1):
        _style(ws.cell(row=tr, column=ci), font=TOTAL_FONT, fill=TOTAL_FILL)
    if not cols[0].get('total'):
        ws.cell(row=tr, column=1, value='Total')
    for ci, c in enumerate(cols, 1):
        if c.get('total'):
            cell = ws.cell(row=tr, column=ci, value=float(totals[c['key']]))
            _style(cell, font=TOTAL_FONT, fill=TOTAL_FILL, align=RIGHT, num_fmt=CURRENCY)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def c_val(bill, key):
    """Raw numeric value of a totalled column, looked up by key."""
    for col in BILL_EXPORT_COLUMNS:
        if col['key'] == key:
            return col['get'](bill)
    return 0


def _format_pdf_value(value, kind):
    if kind == 'num3':
        return f'{value:,.3f}'
    if kind == 'money':
        return f'{value:,.2f}'
    if kind == 'pct':
        return f'{value:.2f}'
    return '' if value is None else str(value)


def export_bills_pdf(bills_qs, title='Billing Export', columns=None, filter_summary=None) -> bytes:
    """
    Landscape table PDF of the selected bill columns. Uses reportlab (already
    a project dependency). Page size and font scale with the number of
    columns so a wide selection stays legible; text cells wrap instead of
    being cut off.

    NOTE: reportlab's built-in Helvetica has no Bengali glyphs, so
    non-Latin allottee names would not render in the PDF (Excel export is
    unaffected). Register a Bengali TTF font here if that's ever needed.
    """
    from xml.sax.saxutils import escape
    from django.conf import settings
    from django.utils import timezone
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A3, A4, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image,
    )

    cols = resolve_bill_columns(columns)
    n = len(cols)

    page = landscape(A3) if n > 14 else landscape(A4)
    margin = 10 * mm
    avail_w = page[0] - 2 * margin
    font_size = 8 if n <= 8 else 7 if n <= 14 else 6 if n <= 20 else 5.5

    base = dict(fontName='Helvetica', fontSize=font_size, leading=font_size + 2)
    st_left   = ParagraphStyle('l', alignment=0, **base)
    st_center = ParagraphStyle('c', alignment=1, **base)
    st_right  = ParagraphStyle('r', alignment=2, **base)
    st_head   = ParagraphStyle('h', alignment=1, textColor=colors.white,
                               **{**base, 'fontName': 'Helvetica-Bold'})
    st_total  = ParagraphStyle('t', alignment=2, **{**base, 'fontName': 'Helvetica-Bold'})
    st_total_l = ParagraphStyle('tl', alignment=0, **{**base, 'fontName': 'Helvetica-Bold'})

    def para(text, kind, align):
        style = st_right if kind in ('num3', 'pct', 'money') else (st_left if align == 'left' else st_center)
        return Paragraph(escape(str(text)), style)

    # Column widths: proportional to the Excel widths, scaled to fit the page.
    weights = [c['width'] for c in cols]
    col_widths = [avail_w * w / sum(weights) for w in weights]

    rows = [[Paragraph(escape(c['label']), st_head) for c in cols]]
    totals = {c['key']: Decimal('0') for c in cols if c.get('total')}
    count = 0
    for count, bill in enumerate(bills_qs, start=1):
        row = []
        for c in cols:
            val = _bill_value(bill, c, count)
            row.append(para(_format_pdf_value(val, c['kind']), c['kind'], c.get('align')))
        rows.append(row)
        for key in totals:
            totals[key] += Decimal(str(c_val(bill, key)))

    story = []

    # Header: logo + title + filter summary
    title_block = [Paragraph(escape(title), ParagraphStyle(
        'title', fontName='Helvetica-Bold', fontSize=13, leading=16))]
    if filter_summary:
        title_block.append(Paragraph(
            escape('Filters: ' + ' | '.join(filter_summary)),
            ParagraphStyle('sub', fontName='Helvetica', fontSize=8, leading=10,
                           textColor=colors.HexColor('#555555'))))
    logo_path = os.path.join(str(settings.BASE_DIR), 'static', 'branding', 'deco-logo.png')
    if os.path.exists(logo_path):
        iw, ih = ImageReader(logo_path).getSize()
        h = 12 * mm
        header = Table([[Image(logo_path, width=h * iw / ih, height=h), title_block]],
                       colWidths=[h * iw / ih + 4 * mm, avail_w - h * iw / ih - 4 * mm])
        header.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                                    ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
        story.append(header)
    else:
        story.extend(title_block)
    story.append(Spacer(1, 4 * mm))

    if count == 0:
        story.append(Paragraph('No bills match the selected filters.', st_left))
    else:
        total_row = [''] * n
        if not cols[0].get('total'):
            total_row[0] = Paragraph('Total', st_total_l)
        for i, c in enumerate(cols):
            if c.get('total'):
                total_row[i] = Paragraph(f"{totals[c['key']]:,.2f}", st_total)
        rows.append(total_row)

        table = Table(rows, colWidths=col_widths, repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E78')),
            ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#B7B7B7')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#F5F7FA')]),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#D9E1F2')),
            ('LEFTPADDING', (0, 0), (-1, -1), 2),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        story.append(table)

    generated = timezone.localtime().strftime('%d-%b-%Y %H:%M')

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(colors.HexColor('#777777'))
        canvas.drawString(margin, 5 * mm, f'DECO Utility Billing — generated {generated}')
        canvas.drawRightString(page[0] - margin, 5 * mm, f'Page {doc.page}')
        canvas.restoreState()

    buf = io.BytesIO()
    SimpleDocTemplate(
        buf, pagesize=page,
        leftMargin=margin, rightMargin=margin, topMargin=margin, bottomMargin=12 * mm,
        title=title,
    ).build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


def export_payments_excel(payments_qs, title='Payment Export') -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = 'Payments'

    # NOTE: previously read p.approval_status, a field that no longer exists
    # on Payment (it was replaced by `status` + `source` during the approval
    # workflow rebuild) — this was an unwired, never-exercised code path
    # that would have crashed with AttributeError on first real use.
    headers = [
        'SL', 'Date', 'Bill No.', 'Project', 'Building', 'Unit', 'Allottee',
        'Amount', 'Method', 'Transaction ID', 'Status', 'Source', 'Received/Reviewed By', 'Notes',
    ]
    _title_row(ws, title, len(headers))
    _header_row(ws, headers)

    for i, w in enumerate([5, 12, 14, 18, 16, 8, 20, 13, 10, 18, 10, 10, 18, 20], 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    total = Decimal('0')
    sl = 0
    for sl, p in enumerate(payments_qs, start=1):
        r = sl + 2
        allottee = getattr(getattr(p.bill.unit, 'allottee', None), 'name', '') or ''
        vals = [
            sl,
            p.payment_date.strftime('%d-%b-%Y') if p.payment_date else '',
            p.bill.bill_number,
            p.bill.project.name if p.bill.project else '',
            p.bill.building.name if p.bill.building else '',
            p.bill.unit.unit_no if p.bill.unit else '',
            allottee,
            float(p.paid_amount),
            p.payment_method,
            p.transaction_id or '—',
            p.status,
            p.source,
            p.reviewed_by.name if p.reviewed_by else (p.received_by.name if p.received_by else (
                '(Customer)' if p.submitted_by_customer else '—'
            )),
            p.notes or '',
        ]
        for col, val in enumerate(vals, 1):
            c = ws.cell(row=r, column=col, value=val)
            if col == 8:
                _style(c, font=NORMAL_FONT, align=RIGHT, num_fmt=CURRENCY)
            elif col == 1:
                _style(c, font=NORMAL_FONT, align=CENTER)
            else:
                _style(c, font=NORMAL_FONT, align=LEFT if col in (4, 5, 7, 14) else CENTER)
        total += p.paid_amount

    tr = sl + 3
    for col in range(1, len(headers) + 1):
        _style(ws.cell(row=tr, column=col), font=TOTAL_FONT, fill=TOTAL_FILL)
    ws.cell(row=tr, column=1, value='Total')
    c = ws.cell(row=tr, column=8, value=float(total))
    _style(c, font=TOTAL_FONT, fill=TOTAL_FILL, align=RIGHT, num_fmt=CURRENCY)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_meter_readings_excel(readings_qs, title='Meter Readings Export') -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = 'Meter Readings'

    headers = [
        'SL', 'Date', 'Meter No.', 'Unit', 'Floor', 'Building', 'Project',
        'Allottee', 'Previous', 'Current', 'Usage (m³)', 'Recorded By', 'Notes',
    ]
    _title_row(ws, title, len(headers))
    _header_row(ws, headers)
    for i, w in enumerate([5, 12, 16, 8, 7, 16, 18, 20, 11, 11, 11, 16, 20], 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    for sl, r_obj in enumerate(readings_qs, start=1):
        r = sl + 2
        unit     = r_obj.meter.unit
        allottee = getattr(getattr(unit, 'allottee', None), 'name', '') or ''
        vals = [
            sl,
            r_obj.reading_date.strftime('%d-%b-%Y') if r_obj.reading_date else '',
            r_obj.meter.meter_no,
            unit.unit_no,
            unit.floor_no,
            unit.building.name,
            unit.building.project.name,
            allottee,
            float(r_obj.previous_reading),
            float(r_obj.current_reading),
            float(r_obj.usage),
            r_obj.recorded_by.name if r_obj.recorded_by else '—',
            r_obj.notes or '',
        ]
        for col, val in enumerate(vals, 1):
            c = ws.cell(row=r, column=col, value=val)
            if col in (9, 10, 11):
                _style(c, font=NORMAL_FONT, align=RIGHT, num_fmt='#,##0.000')
            elif col == 1:
                _style(c, font=NORMAL_FONT, align=CENTER)
            else:
                _style(c, font=NORMAL_FONT, align=LEFT if col in (6, 7, 8, 13) else CENTER)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()