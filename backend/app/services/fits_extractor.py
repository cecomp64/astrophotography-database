import re
from pathlib import Path
from datetime import datetime
from typing import Optional, Any
from dataclasses import dataclass

from astropy.io import fits


@dataclass
class FitsMetadata:
    file_path: str
    file_name: str
    directory_path: str
    date_taken: Optional[datetime] = None
    exposure_time: Optional[float] = None
    filter_name: Optional[str] = None
    telescope: Optional[str] = None
    camera: Optional[str] = None
    gain: Optional[int] = None
    iso: Optional[int] = None
    binning: Optional[str] = None
    object_name: Optional[str] = None
    ra: Optional[float] = None
    dec: Optional[float] = None
    fits_header: Optional[dict[str, Any]] = None


class FitsExtractor:
    # Common FITS header keywords for various metadata
    DATE_KEYWORDS = ["DATE-OBS", "DATE", "DATE-AVG", "DATE-BEG"]
    EXPOSURE_KEYWORDS = ["EXPTIME", "EXPOSURE", "EXPOTIME"]
    FILTER_KEYWORDS = ["FILTER", "FILTER1", "FILTER2", "FILTNAM1"]
    TELESCOPE_KEYWORDS = ["TELESCOP", "INSTRUME", "SCOPE"]
    CAMERA_KEYWORDS = ["CAMERA", "INSTRUME", "CCD-NAME", "DETECTOR"]
    GAIN_KEYWORDS = ["GAIN", "EGAIN", "CCD-GAIN"]
    ISO_KEYWORDS = ["ISO", "ISOSPEED"]
    BINNING_KEYWORDS = ["XBINNING", "BINNING", "CCDBIN1"]
    OBJECT_KEYWORDS = ["OBJECT", "OBJNAME", "TARGET", "TARGNAME"]
    RA_KEYWORDS = ["RA", "OBJCTRA", "CRVAL1"]
    DEC_KEYWORDS = ["DEC", "OBJCTDEC", "CRVAL2"]

    # Patterns for extracting object names from filenames
    FILENAME_PATTERNS = [
        # M42_2023-01-01_Luminance.fits
        r"^([A-Za-z]+\s?\d+)[-_]",
        # NGC7000_Ha_300s.fits
        r"^(NGC\s?\d+)[-_]",
        # IC1396_LRGB.fits
        r"^(IC\s?\d+)[-_]",
        # Sh2-129_SII.fits
        r"^(Sh2?-\d+)[-_]",
        # Generic pattern for catalog objects
        r"^([A-Za-z]{1,3}\s?\d{1,5})[-_]",
    ]

    def extract(self, file_path: str | Path) -> FitsMetadata:
        file_path = Path(file_path)

        metadata = FitsMetadata(
            file_path=str(file_path),
            file_name=file_path.name,
            directory_path=str(file_path.parent),
        )

        try:
            with fits.open(file_path) as hdul:
                header = hdul[0].header

                # Extract all metadata from header
                metadata.date_taken = self._extract_date(header)
                metadata.exposure_time = self._extract_float(header, self.EXPOSURE_KEYWORDS)
                metadata.filter_name = self._extract_string(header, self.FILTER_KEYWORDS)
                metadata.telescope = self._extract_string(header, self.TELESCOPE_KEYWORDS)
                metadata.camera = self._extract_camera(header)
                metadata.gain = self._extract_int(header, self.GAIN_KEYWORDS)
                metadata.iso = self._extract_int(header, self.ISO_KEYWORDS)
                metadata.binning = self._extract_binning(header)
                metadata.object_name = self._extract_string(header, self.OBJECT_KEYWORDS)
                metadata.ra = self._extract_float(header, self.RA_KEYWORDS)
                metadata.dec = self._extract_float(header, self.DEC_KEYWORDS)

                # Store relevant header keys as dict
                metadata.fits_header = self._header_to_dict(header)
        except Exception as e:
            # If FITS parsing fails, we still have basic file info
            print(f"Warning: Could not parse FITS header for {file_path}: {e}")

        # Try to extract object name from filename if not in header
        if not metadata.object_name:
            metadata.object_name = self._extract_object_from_filename(file_path.name)

        # Try to extract object name from directory path
        if not metadata.object_name:
            metadata.object_name = self._extract_object_from_path(file_path)

        return metadata

    def _extract_date(self, header: fits.Header) -> Optional[datetime]:
        for keyword in self.DATE_KEYWORDS:
            if keyword in header:
                try:
                    date_str = str(header[keyword])
                    # Try various date formats
                    for fmt in [
                        "%Y-%m-%dT%H:%M:%S",
                        "%Y-%m-%dT%H:%M:%S.%f",
                        "%Y-%m-%d",
                        "%Y/%m/%d %H:%M:%S",
                    ]:
                        try:
                            return datetime.strptime(date_str[:len(fmt.replace("%", "").replace("-", "").replace(":", "").replace("T", "").replace(".", "").replace("f", "000000"))], fmt)
                        except ValueError:
                            continue
                    # Try with fromisoformat as fallback
                    return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    continue
        return None

    def _extract_float(self, header: fits.Header, keywords: list[str]) -> Optional[float]:
        for keyword in keywords:
            if keyword in header:
                try:
                    return float(header[keyword])
                except (ValueError, TypeError):
                    continue
        return None

    def _extract_int(self, header: fits.Header, keywords: list[str]) -> Optional[int]:
        for keyword in keywords:
            if keyword in header:
                try:
                    return int(header[keyword])
                except (ValueError, TypeError):
                    continue
        return None

    def _extract_string(self, header: fits.Header, keywords: list[str]) -> Optional[str]:
        for keyword in keywords:
            if keyword in header:
                value = header[keyword]
                if value and str(value).strip():
                    return str(value).strip()
        return None

    def _extract_camera(self, header: fits.Header) -> Optional[str]:
        # Try camera-specific keywords first
        camera = self._extract_string(header, ["CAMERA", "CCD-NAME", "DETECTOR"])
        if camera:
            return camera
        # INSTRUME might be camera on some setups
        instrume = self._extract_string(header, ["INSTRUME"])
        if instrume and "camera" in instrume.lower():
            return instrume
        return instrume

    def _extract_binning(self, header: fits.Header) -> Optional[str]:
        xbin = self._extract_int(header, ["XBINNING", "CCDBIN1"])
        ybin = self._extract_int(header, ["YBINNING", "CCDBIN2"])

        if xbin and ybin:
            return f"{xbin}x{ybin}"
        elif xbin:
            return f"{xbin}x{xbin}"

        # Try string binning value
        binning = self._extract_string(header, ["BINNING"])
        if binning:
            return binning

        return None

    def _header_to_dict(self, header: fits.Header) -> dict[str, Any]:
        result = {}
        for key in header.keys():
            if key and not key.startswith("COMMENT") and not key.startswith("HISTORY"):
                try:
                    value = header[key]
                    # Convert to JSON-serializable types
                    if isinstance(value, (int, float, str, bool)):
                        result[key] = value
                    else:
                        result[key] = str(value)
                except Exception:
                    continue
        return result

    def _extract_object_from_filename(self, filename: str) -> Optional[str]:
        # Remove extension
        name = Path(filename).stem

        for pattern in self.FILENAME_PATTERNS:
            match = re.match(pattern, name, re.IGNORECASE)
            if match:
                return match.group(1).strip()

        return None

    def _extract_object_from_path(self, file_path: Path) -> Optional[str]:
        # Look for object names in parent directories
        parts = file_path.parts

        for part in reversed(parts[:-1]):  # Exclude the filename
            # Check if directory name looks like an object name
            for pattern in self.FILENAME_PATTERNS:
                # Adjust pattern to match full directory name
                adjusted_pattern = pattern.replace("[-_]", "$").replace("^", "^").replace("$", "$")
                if re.match(adjusted_pattern, part, re.IGNORECASE):
                    return part

            # Check for common catalog prefixes
            if re.match(r"^(M|NGC|IC|Sh2?)\s?\d+", part, re.IGNORECASE):
                return part

        return None
