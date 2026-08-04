"""
Bulk Unit import: template generation + upload validation/creation.

Workflow (see UnitsPage.tsx's Bulk Import modal):
  1. Staff selects a Project, then a Building.
  2. GET the template for that building -> a prefilled .xlsx with one
     example row.
  3. Staff fills in real rows below the example row and uploads it.
  4. If ANY row fails validation, nothing is written to the database —
     an annotated copy of the same workbook is returned instead, with an
     "Errors" column and the offending cells highlighted, so the user can
     fix and re-upload.
  5. If every row is valid, all Units (+ Allottee, + Meter) are created
     in a single transaction and a JSON summary is returned.

Row layout (1-indexed, matches generate_unit_import_template):
  Row 1: title
  Row 2: header
  Row 3: example row (always skipped on import, regardless of content)
  Row 4+: data
"""
import io
import re

from django.db import transaction
from openpyxl import Workbook, load_workbook
from openpyxl.styles import PatternFill, Font
from openpyxl.utils import get_column_letter

# Reusing the same styling helpers/constants as the existing Billing/
# Payments/Meter-reading exports, so this template matches the rest of
# the system's Excel look and feel instead of introducing a new style.
from apps.reports.exports.excel_exports import (
    FONT_NAME, NORMAL_FONT, LEFT, CENTER, _style, _title_row, _header_row,
)
from apps.projects.models import Package
from apps.meters.models import Meter
from .models import Unit, Allottee

MOBILE_PATTERN = re.compile(r'^01[3-9]\d{8}$')

# THE FIX (meter-reading baseline bug, bulk-import path): this import
# workflow creates Meter rows directly (see create_units_from_rows below),
# completely bypassing MeterAssignModal — so it needed its own Initial
# Reading column, or every unit onboarded via bulk import would silently
# get Meter.initial_reading=0 regardless of what the physical meter
# actually showed, reintroducing the exact same first-bill-overcharge bug
# for anyone imported this way instead of assigned one-by-one.
#
# Optional column, same as the modal: blank/omitted -> defaults to 0
# (meter treated as genuinely brand new).
HEADERS = [
    'Floor No.*', 'Unit No.*', 'Mobile Number*',
    'Allottee Name', 'Allottee Email', 'Allottee NID',
    'Meter No.*', 'Initial Reading', 'Meter Type', 'Barcode',
    'Package Name', 'Status',
]
COL_WIDTHS = [10, 12, 16, 20, 24, 16, 16, 16, 14, 20, 20, 12]

EXAMPLE_ROW = [
    1, 'A1', '01712345678',
    'Jane Doe', 'jane@example.com', '1234567890123',
    'MTR-00001', 0, 'Standard', '',
    '', 'Active',
]

ERROR_FILL       = PatternFill('solid', start_color='FDE2E1', end_color='FDE2E1')
ERROR_CELL_FILL  = PatternFill('solid', start_color='F8B4B4', end_color='F8B4B4')
ERROR_FONT       = Font(name=FONT_NAME, size=10, color='9B1C1C')
EXAMPLE_FILL     = PatternFill('solid', start_color='F1F5F9', end_color='F1F5F9')
EXAMPLE_FONT     = Font(name=FONT_NAME, size=10, italic=True, color='64748B')

# 0-indexed column positions, used repeatedly below.
(COL_FLOOR, COL_UNIT, COL_MOBILE, COL_ANAME, COL_AEMAIL, COL_ANID,
 COL_METER_NO, COL_INITIAL_READING, COL_METER_TYPE, COL_BARCODE,
 COL_PACKAGE, COL_STATUS) = range(12)

EXAMPLE_ROW_INDEX = 3
DATA_START_ROW = 4


def generate_unit_import_template(building) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = 'Units'

    title = f'Bulk Unit Import — {building.project.name} / {building.name}'
    _title_row(ws, title, len(HEADERS))
    _header_row(ws, HEADERS)

    for i, w in enumerate(COL_WIDTHS, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # Example row is always ignored on import (see DATA_START_ROW) — it's
    # here purely so the user can see the expected format at a glance.
    for col, val in enumerate(EXAMPLE_ROW, 1):
        c = ws.cell(row=EXAMPLE_ROW_INDEX, column=col, value=val)
        _style(c, font=EXAMPLE_FONT, fill=EXAMPLE_FILL, align=LEFT if col in (2, 4, 5) else CENTER)

    ws.freeze_panes = 'A4'

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _row_errors(values, seen_unit_keys, seen_meter_nos, seen_barcodes,
                 existing_unit_keys, existing_meter_nos, existing_barcodes, packages_by_name):
    errors = {}  # 0-based column index -> message

    (floor_raw, unit_no, mobile, aname, aemail, anid,
     meter_no, initial_reading_raw, meter_type, barcode, package_name, status) = values

    # Floor No.
    try:
        floor_no = int(floor_raw)
        if floor_no < 0:
            raise ValueError
    except (TypeError, ValueError):
        errors[COL_FLOOR] = 'Floor No. must be a non-negative whole number'
        floor_no = None

    # Unit No.
    unit_no = str(unit_no).strip() if unit_no is not None else ''
    if not unit_no:
        errors[COL_UNIT] = 'Unit No. is required'

    # Duplicate Floor+Unit within this building (file + existing DB rows)
    if floor_no is not None and unit_no:
        key = (floor_no, unit_no)
        if key in existing_unit_keys:
            errors[COL_UNIT] = f'Floor {floor_no} / Unit {unit_no} already exists in this building'
        elif key in seen_unit_keys:
            errors[COL_UNIT] = f'Duplicate Floor {floor_no} / Unit {unit_no} elsewhere in this file'
        else:
            seen_unit_keys.add(key)

    # Mobile Number (mandatory — see Update 1 / Allottee section rule)
    mobile = str(mobile).strip() if mobile is not None else ''
    if not mobile:
        errors[COL_MOBILE] = 'Mobile Number is required'
    elif not MOBILE_PATTERN.match(mobile):
        errors[COL_MOBILE] = 'Mobile Number must look like 01XXXXXXXXX'

    # Meter No. — Meter.meter_no is globally unique
    meter_no = str(meter_no).strip() if meter_no is not None else ''
    if not meter_no:
        errors[COL_METER_NO] = 'Meter No. is required'
    elif meter_no in existing_meter_nos:
        errors[COL_METER_NO] = f'Meter No. "{meter_no}" is already assigned to another unit'
    elif meter_no in seen_meter_nos:
        errors[COL_METER_NO] = f'Duplicate Meter No. "{meter_no}" elsewhere in this file'
    else:
        seen_meter_nos.add(meter_no)

    # Initial Reading — optional, defaults to 0 (meter treated as brand
    # new/unused). If the physical meter already has usage on its dial
    # (reused/reassigned meter, or onboarding an existing installation),
    # this should be filled in — otherwise the unit's first bill will be
    # calculated from a 0 baseline and overcharge for the meter's entire
    # prior accumulated usage. See Meter.initial_reading.
    initial_reading = 0
    if initial_reading_raw not in (None, ''):
        try:
            initial_reading = float(initial_reading_raw)
            if initial_reading < 0:
                raise ValueError
        except (TypeError, ValueError):
            errors[COL_INITIAL_READING] = 'Initial Reading must be a non-negative number'
            initial_reading = 0

    # Barcode — optional, but Meter.barcode is unique when present
    barcode = str(barcode).strip() if barcode is not None else ''
    if barcode:
        if barcode in existing_barcodes:
            errors[COL_BARCODE] = f'Barcode "{barcode}" is already in use'
        elif barcode in seen_barcodes:
            errors[COL_BARCODE] = f'Duplicate barcode "{barcode}" elsewhere in this file'
        else:
            seen_barcodes.add(barcode)

    # Package — optional, matched by name (case-insensitive)
    package = None
    package_name = str(package_name).strip() if package_name is not None else ''
    if package_name:
        package = packages_by_name.get(package_name.lower())
        if package is None:
            errors[COL_PACKAGE] = f'No package named "{package_name}" was found'

    # Status — optional, defaults to Active
    status = (str(status).strip() if status else '') or Unit.STATUS_ACTIVE
    if status not in (Unit.STATUS_ACTIVE, Unit.STATUS_INACTIVE):
        errors[COL_STATUS] = 'Status must be Active or Inactive'

    meter_type = (str(meter_type).strip() if meter_type else '') or 'Standard'
    aname  = str(aname).strip() if aname else ''
    aemail = str(aemail).strip() if aemail else ''
    anid   = str(anid).strip() if anid else ''

    cleaned = {
        'floor_no': floor_no, 'unit_no': unit_no, 'mobile_number': mobile,
        'allottee_name': aname, 'allottee_email': aemail, 'allottee_nid': anid,
        'meter_no': meter_no, 'initial_reading': initial_reading,
        'meter_type': meter_type, 'barcode': barcode or None,
        'package': package, 'status': status,
    }
    return errors, cleaned


def parse_and_validate(workbook_file, building):
    """
    Returns (errors_by_row, cleaned_rows, raw_rows):
      errors_by_row: {row_idx (1-based, matches the sheet): {col_idx: msg}}
      cleaned_rows:  cleaned dicts in file order — only meaningful when
                     errors_by_row is empty
      raw_rows:      [(row_idx, raw_values), ...] for every non-blank data
                     row, used to rebuild the annotated error file
    """
    wb = load_workbook(workbook_file, data_only=True)
    ws = wb.active

    existing_unit_keys = set(
        Unit.objects.filter(building=building).values_list('floor_no', 'unit_no')
    )
    existing_meter_nos = set(Meter.objects.values_list('meter_no', flat=True))
    existing_barcodes = set(
        Meter.objects.exclude(barcode__isnull=True).exclude(barcode='')
        .values_list('barcode', flat=True)
    )
    packages_by_name = {p.name.lower(): p for p in Package.objects.all()}

    seen_unit_keys, seen_meter_nos, seen_barcodes = set(), set(), set()
    errors_by_row, cleaned_rows, raw_rows = {}, [], []

    for row_idx in range(DATA_START_ROW, ws.max_row + 1):
        values = [ws.cell(row=row_idx, column=c + 1).value for c in range(len(HEADERS))]
        if all(v in (None, '') for v in values):
            continue  # trailing blank row

        raw_rows.append((row_idx, values))
        errors, cleaned = _row_errors(
            values, seen_unit_keys, seen_meter_nos, seen_barcodes,
            existing_unit_keys, existing_meter_nos, existing_barcodes, packages_by_name,
        )
        if errors:
            errors_by_row[row_idx] = errors
        else:
            cleaned_rows.append(cleaned)

    return errors_by_row, cleaned_rows, raw_rows


def build_annotated_error_workbook(building, raw_rows, errors_by_row) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = 'Units'

    headers = HEADERS + ['Errors']
    title = f'Bulk Unit Import — {building.project.name} / {building.name} (fix highlighted cells and re-upload)'
    _title_row(ws, title, len(headers))
    _header_row(ws, headers)

    for i, w in enumerate(COL_WIDTHS + [40], 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    out_row = 3
    for row_idx, values in raw_rows:
        row_errors = errors_by_row.get(row_idx, {})
        for col, val in enumerate(values):
            c = ws.cell(row=out_row, column=col + 1, value=val)
            if col in row_errors:
                _style(c, font=ERROR_FONT, fill=ERROR_CELL_FILL, align=LEFT if col in (1, 3, 4) else CENTER)
            else:
                _style(c, font=NORMAL_FONT, align=LEFT if col in (1, 3, 4) else CENTER)
        msg_col = len(HEADERS) + 1
        msg = '; '.join(row_errors.values())
        c = ws.cell(row=out_row, column=msg_col, value=msg)
        _style(c, font=ERROR_FONT if msg else NORMAL_FONT,
               fill=ERROR_FILL if msg else None, align=LEFT)
        out_row += 1

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@transaction.atomic
def create_units_from_rows(building, cleaned_rows):
    created = 0
    for row in cleaned_rows:
        unit = Unit.objects.create(
            building=building,
            floor_no=row['floor_no'],
            unit_no=row['unit_no'],
            mobile_number=row['mobile_number'],
            package=row['package'],
            status=row['status'],
        )
        if row['allottee_name']:
            Allottee.objects.create(
                unit=unit,
                name=row['allottee_name'],
                email=row['allottee_email'],
                nid=row['allottee_nid'],
            )
        meter = Meter.objects.create(
            unit=unit,
            meter_no=row['meter_no'],
            meter_type=row['meter_type'],
            barcode=row['barcode'],
            initial_reading=row['initial_reading'],
        )
        # Keep the legacy Unit.meter_no mirror in sync — same reasoning as
        # MeterSerializer.create/update for the single-unit Assign Meter flow.
        unit.meter_no = meter.meter_no
        unit.save(update_fields=['meter_no'])
        created += 1
    return created