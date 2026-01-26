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
    # FOV-related fields
    pixel_size_x: Optional[float] = None  # microns
    pixel_size_y: Optional[float] = None  # microns
    image_width: Optional[int] = None  # pixels
    image_height: Optional[int] = None  # pixels
    focal_length: Optional[float] = None  # mm
    fov_width: Optional[float] = None  # degrees
    fov_height: Optional[float] = None  # degrees


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
    # FOV-related keywords
    PIXEL_SIZE_X_KEYWORDS = ["XPIXSZ", "PIXSIZE1", "PIXELX"]
    PIXEL_SIZE_Y_KEYWORDS = ["YPIXSZ", "PIXSIZE2", "PIXELY"]
    IMAGE_WIDTH_KEYWORDS = ["NAXIS1", "IMAGEW"]
    IMAGE_HEIGHT_KEYWORDS = ["NAXIS2", "IMAGEH"]
    FOCAL_LENGTH_KEYWORDS = ["FOCALLEN", "FOCAL", "FL"]

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
        import math
        file_path = Path(file_path)

        metadata = FitsMetadata(
            file_path=str(file_path),
            file_name=file_path.name,
            directory_path=str(file_path.parent),
        )

        try:
            with fits.open(file_path) as hdul:
                header = hdul[0].header
                data = hdul[0].data

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
                metadata.ra = self._extract_ra(header)
                metadata.dec = self._extract_dec(header)

                # Extract FOV-related fields
                metadata.pixel_size_x = self._extract_float(header, self.PIXEL_SIZE_X_KEYWORDS)
                metadata.pixel_size_y = self._extract_float(header, self.PIXEL_SIZE_Y_KEYWORDS)
                metadata.focal_length = self._extract_float(header, self.FOCAL_LENGTH_KEYWORDS)

                # Extract image dimensions from header first
                metadata.image_width = self._extract_int(header, self.IMAGE_WIDTH_KEYWORDS)
                metadata.image_height = self._extract_int(header, self.IMAGE_HEIGHT_KEYWORDS)

                # Fallback to data.shape if dimensions not in header
                if data is not None and (metadata.image_width is None or metadata.image_height is None):
                    shape = data.shape
                    if len(shape) >= 2:
                        # FITS data is stored as [height, width] or [channels, height, width]
                        if len(shape) == 2:
                            metadata.image_height = shape[0]
                            metadata.image_width = shape[1]
                        elif len(shape) >= 3:
                            metadata.image_height = shape[-2]
                            metadata.image_width = shape[-1]

                # Calculate FOV if we have the required data
                fov_width, fov_height = self._calculate_fov(
                    metadata.pixel_size_x,
                    metadata.pixel_size_y,
                    metadata.image_width,
                    metadata.image_height,
                    metadata.focal_length,
                    metadata.binning
                )
                metadata.fov_width = fov_width
                metadata.fov_height = fov_height

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

    def _calculate_fov(
        self,
        pixel_size_x: Optional[float],
        pixel_size_y: Optional[float],
        image_width: Optional[int],
        image_height: Optional[int],
        focal_length: Optional[float],
        binning: Optional[str]
    ) -> tuple[Optional[float], Optional[float]]:
        """
        Calculate FOV in degrees from sensor and optics parameters.

        Formula: FOV = 2 * arctan(sensor_size_mm / (2 * focal_length_mm)) * (180/pi)
        Where: sensor_size_mm = (pixel_count * pixel_size_microns) / 1000
        """
        import math

        if not all([pixel_size_x, image_width, focal_length]):
            return None, None

        # Get binning factor (default 1)
        bin_factor = 1
        if binning:
            try:
                bin_factor = int(binning.split('x')[0])
            except (ValueError, IndexError):
                pass

        # Calculate effective pixel size (accounting for binning)
        effective_pixel_x = pixel_size_x * bin_factor
        effective_pixel_y = (pixel_size_y or pixel_size_x) * bin_factor

        # Calculate sensor size in mm (pixel size is in microns)
        sensor_width_mm = (image_width * effective_pixel_x) / 1000
        sensor_height_mm = ((image_height or image_width) * effective_pixel_y) / 1000

        # Calculate FOV using arctan formula
        fov_width = 2 * math.degrees(math.atan(sensor_width_mm / (2 * focal_length)))
        fov_height = 2 * math.degrees(math.atan(sensor_height_mm / (2 * focal_length)))

        return fov_width, fov_height

    def _extract_ra(self, header: fits.Header) -> Optional[float]:
        """Extract RA in degrees, handling sexagesimal format."""
        for keyword in self.RA_KEYWORDS:
            if keyword in header:
                value = header[keyword]
                if value is None:
                    continue
                # Try as float first
                try:
                    return float(value)
                except (ValueError, TypeError):
                    pass
                # Try parsing sexagesimal (HH:MM:SS or HH MM SS)
                try:
                    ra_deg = self._parse_sexagesimal_ra(str(value))
                    if ra_deg is not None:
                        return ra_deg
                except Exception:
                    pass
        return None

    def _extract_dec(self, header: fits.Header) -> Optional[float]:
        """Extract DEC in degrees, handling sexagesimal format."""
        for keyword in self.DEC_KEYWORDS:
            if keyword in header:
                value = header[keyword]
                if value is None:
                    continue
                # Try as float first
                try:
                    return float(value)
                except (ValueError, TypeError):
                    pass
                # Try parsing sexagesimal (DD:MM:SS or DD MM SS)
                try:
                    dec_deg = self._parse_sexagesimal_dec(str(value))
                    if dec_deg is not None:
                        return dec_deg
                except Exception:
                    pass
        return None

    def _parse_sexagesimal_ra(self, ra_str: str) -> Optional[float]:
        """Parse RA from HH:MM:SS or HH MM SS to degrees."""
        # Remove any leading/trailing whitespace
        ra_str = ra_str.strip()
        # Try different separators
        for sep in [':', ' ']:
            parts = ra_str.split(sep)
            if len(parts) >= 2:
                try:
                    hours = float(parts[0])
                    minutes = float(parts[1])
                    seconds = float(parts[2]) if len(parts) > 2 else 0.0
                    # Convert to degrees (RA: 1 hour = 15 degrees)
                    return (hours + minutes / 60 + seconds / 3600) * 15
                except (ValueError, IndexError):
                    continue
        return None

    def _parse_sexagesimal_dec(self, dec_str: str) -> Optional[float]:
        """Parse DEC from DD:MM:SS or DD MM SS to degrees."""
        dec_str = dec_str.strip()
        # Check for negative sign
        sign = 1
        if dec_str.startswith('-'):
            sign = -1
            dec_str = dec_str[1:]
        elif dec_str.startswith('+'):
            dec_str = dec_str[1:]

        for sep in [':', ' ']:
            parts = dec_str.split(sep)
            if len(parts) >= 2:
                try:
                    degrees = float(parts[0])
                    minutes = float(parts[1])
                    seconds = float(parts[2]) if len(parts) > 2 else 0.0
                    return sign * (degrees + minutes / 60 + seconds / 3600)
                except (ValueError, IndexError):
                    continue
        return None

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
        # Look for object names in parent directories, preferring deeper nested ones
        # This helps skip equipment names (like telescope names) in shallower directories
        parts = file_path.parts

        # Check deeper directories first (reverse from the file backwards)
        # Skip shallow directories which likely contain equipment names
        found_objects = []
        for i, part in enumerate(reversed(parts[:-1])):  # Exclude the filename
            depth = i  # How many levels deep from the file
            
            # Skip very shallow levels (0-2) which often contain equipment/date info
            if depth < 2:
                continue
            
            # Check if directory name looks like an object name
            for pattern in self.FILENAME_PATTERNS:
                # Adjust pattern to match full directory name
                adjusted_pattern = pattern.replace("[-_]", "$").replace("^", "^").replace("$", "$")
                if re.match(adjusted_pattern, part, re.IGNORECASE):
                    found_objects.append((depth, part))

            # Check for common catalog prefixes (more specific patterns)
            if re.match(r"^(M\s?\d{1,3}|NGC\s?\d{1,5}|IC\s?\d{1,5}|Sh2?-?\d{1,3})$", part, re.IGNORECASE):
                found_objects.append((depth, part))

        # Return the deepest (most nested) object found
        if found_objects:
            found_objects.sort(reverse=True)  # Sort by depth descending
            return found_objects[0][1]

        return None
