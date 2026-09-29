"""
Server-side upload processing shared by meter photos, staff payment proofs
and customer-portal payment proofs.

Whatever the browser sends (JPEG, PNG, HEIC-converted, a WebP that the client
already made, ...) is verified as a real image, EXIF-rotated, downscaled if
needed and stored as WebP. PDFs (invoice/receipt proofs) are validated by
their header and stored untouched.

Stored file names are random (uuid) so original names such as
"customer-nid.png" never end up on disk or in URLs.
"""
import io
import uuid

from django.conf import settings
from django.core.files.uploadedfile import InMemoryUploadedFile
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import serializers

# Hard cap on the raw upload, before any processing.
MAX_UPLOAD_BYTES = getattr(settings, 'IMAGE_UPLOAD_MAX_MB', 15) * 1024 * 1024
# Guards against decompression bombs (small file, enormous pixel count).
MAX_PIXELS = 80_000_000
# An already-WebP file at or below this size and within the dimension limit
# is kept as-is, so client-compressed images aren't re-encoded a second time.
KEEP_WEBP_BELOW_BYTES = int(1.5 * 1024 * 1024)

# Presets: (max longest side in px, WebP quality 1-100)
METER_PHOTO = dict(max_side=1600, quality=80)   # digits must stay legible
PROOF_IMAGE = dict(max_side=1600, quality=75)   # screenshots / receipts


def _random_name(ext: str) -> str:
    return f'{uuid.uuid4().hex}.{ext}'


def _check_size(upload):
    if upload.size > MAX_UPLOAD_BYTES:
        mb = MAX_UPLOAD_BYTES // (1024 * 1024)
        raise serializers.ValidationError(f'File is too large (max {mb} MB).')


def optimize_image(upload, *, max_side=1600, quality=80):
    """Validate `upload` as an image and return it as a WebP upload."""
    _check_size(upload)

    try:
        upload.seek(0)
        probe = Image.open(upload)
        probe.verify()  # cheap integrity check; invalidates `probe`
        upload.seek(0)
        img = Image.open(upload)
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        raise serializers.ValidationError('Upload a valid image. The file is corrupted or not an image.')

    if img.width * img.height > MAX_PIXELS:
        raise serializers.ValidationError('Image dimensions are too large.')

    # Already a reasonably small WebP within limits: keep the bytes untouched.
    if (
        img.format == 'WEBP'
        and max(img.size) <= max_side
        and upload.size <= KEEP_WEBP_BELOW_BYTES
    ):
        upload.seek(0)
        data = upload.read()
        return _wrap(data, len(data))

    try:
        img = ImageOps.exif_transpose(img)  # honour phone camera rotation
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            img = img.convert('RGBA')
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        if max(img.size) > max_side:
            img.thumbnail((max_side, max_side), Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format='WEBP', quality=quality, method=4)
    except Exception:
        raise serializers.ValidationError('Could not process this image. Try a different photo.')

    data = buf.getvalue()
    return _wrap(data, len(data))


def _wrap(data: bytes, size: int):
    buf = io.BytesIO(data)
    return InMemoryUploadedFile(
        file=buf,
        field_name=None,
        name=_random_name('webp'),
        content_type='image/webp',
        size=size,
        charset=None,
    )


def process_proof_file(upload):
    """
    Payment proof that may be an image OR a PDF (proof_invoice).
    Images -> WebP. PDFs -> validated by magic bytes, stored as-is.
    """
    _check_size(upload)

    name = (getattr(upload, 'name', '') or '').lower()
    ctype = (getattr(upload, 'content_type', '') or '').lower()

    if name.endswith('.pdf') or ctype == 'application/pdf':
        upload.seek(0)
        header = upload.read(5)
        upload.seek(0)
        if header != b'%PDF-':
            raise serializers.ValidationError('The file is not a valid PDF.')
        upload.name = _random_name('pdf')
        return upload

    return optimize_image(upload, **PROOF_IMAGE)