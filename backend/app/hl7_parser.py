"""Parser for HL7-lite .txt format results produced by laboratory analyzers (SXFT5-184).

Supports:
1. Standard BARCODE pipe-delimited lines:
   BARCODE|<barcode>|<test_name>|<result_numeric_or_text>|<units>|<status>|<notes>
   BARCODE|<barcode>|<test_name>|<result_numeric>|<units>
   BARCODE|<barcode>|<result_numeric_or_text>|<units>
2. HL7 ORU^R01 segment-style messages:
   OBR|1||<barcode>|<test_name>|...
   OBX|1|NM|<test_name>||<result>|<units>|<range>|<abnormal_flag>|||<result_status>
3. Key-Value text records (BARCODE: ..., RESULT: ...)
"""
from dataclasses import dataclass
from decimal import Decimal
import re


@dataclass
class HL7ResultRecord:
    barcode: str
    test_name: str | None = None
    result_numeric: float | None = None
    result_text: str | None = None
    units: str | None = None
    status: str = "completed"
    reference_range_text: str | None = None
    notes: str | None = None
    raw_line: str = ""

    def to_dict(self) -> dict:
        return {
            "barcode": self.barcode,
            "test_name": self.test_name,
            "result_numeric": self.result_numeric,
            "result_text": self.result_text,
            "units": self.units,
            "status": self.status,
            "reference_range_text": self.reference_range_text,
            "notes": self.notes,
        }


def _try_parse_number(val: str | None) -> tuple[float | None, str | None]:
    """Return (float_val, None) if numeric, else (None, string_val)."""
    if not val:
        return None, None
    s = val.strip()
    try:
        f = float(s)
        return f, None
    except ValueError:
        return None, s


def parse_hl7_lite(content: str) -> list[HL7ResultRecord]:
    """Parse HL7-lite text file content into a list of HL7ResultRecord objects."""
    if not content or not content.strip():
        return []

    records: list[HL7ResultRecord] = []
    lines = content.strip().splitlines()

    current_obr_barcode: str | None = None
    current_obr_test_name: str | None = None

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        # Format 1: Direct BARCODE|... lines
        if line.startswith("BARCODE|") or line.startswith("barcode|"):
            parts = [p.strip() for p in line.split("|")]
            # parts[0] is "BARCODE"
            if len(parts) >= 2 and parts[1]:
                barcode = parts[1]
                test_name = None
                result_num = None
                result_txt = None
                units = None
                status = "completed"
                notes = None

                if len(parts) == 3:
                    # BARCODE|<barcode>|<result>
                    result_num, result_txt = _try_parse_number(parts[2])
                elif len(parts) == 4:
                    # Could be BARCODE|<barcode>|<test_name>|<result> OR BARCODE|<barcode>|<result>|<units>
                    num_check, _ = _try_parse_number(parts[2])
                    if num_check is not None:
                        result_num = num_check
                        units = parts[3]
                    else:
                        test_name = parts[2]
                        result_num, result_txt = _try_parse_number(parts[3])
                elif len(parts) >= 5:
                    test_name = parts[2] if parts[2] else None
                    result_num, result_txt = _try_parse_number(parts[3])
                    units = parts[4] if parts[4] else None
                    if len(parts) >= 6 and parts[5]:
                        status = parts[5].lower()
                    if len(parts) >= 7 and parts[6]:
                        notes = parts[6]

                records.append(
                    HL7ResultRecord(
                        barcode=barcode,
                        test_name=test_name,
                        result_numeric=result_num,
                        result_text=result_txt,
                        units=units,
                        status=status,
                        notes=notes,
                        raw_line=line,
                    )
                )
            continue

        # Format 2: HL7 segments (OBR / OBX)
        if line.startswith("OBR|"):
            parts = [p.strip() for p in line.split("|")]
            if len(parts) > 3 and parts[3]:
                current_obr_barcode = parts[3].split("^")[0]
            if len(parts) > 4 and parts[4]:
                current_obr_test_name = parts[4].split("^")[-1]
            continue

        if line.startswith("OBX|") and current_obr_barcode:
            parts = [p.strip() for p in line.split("|")]
            # OBX|set_id|val_type|test_id|sub_id|result|units|range|abnormal|...|status
            obx_test = current_obr_test_name
            if len(parts) > 3 and parts[3] and not obx_test:
                obx_test = parts[3].split("^")[-1]

            result_val = parts[5] if len(parts) > 5 else None
            units = parts[6] if len(parts) > 6 else None
            ref_range = parts[7] if len(parts) > 7 else None
            status_flag = parts[11].lower() if len(parts) > 11 and parts[11] else "completed"

            result_num, result_txt = _try_parse_number(result_val)
            records.append(
                HL7ResultRecord(
                    barcode=current_obr_barcode,
                    test_name=obx_test,
                    result_numeric=result_num,
                    result_text=result_txt,
                    units=units,
                    status="completed" if status_flag in ("f", "c", "final", "completed") else status_flag,
                    reference_range_text=ref_range,
                    raw_line=line,
                )
            )
            continue

        # Format 3: Key-value lines e.g. BARCODE: ...
        if ":" in line:
            kv_match = re.match(r"^(?:BARCODE|SAMPLE|SAMPLE_ID):\s*([A-Za-z0-9\-]+)", line, re.IGNORECASE)
            if kv_match:
                current_obr_barcode = kv_match.group(1).strip()
                continue
            if current_obr_barcode:
                res_match = re.match(r"^(?:RESULT|VALUE):\s*([0-9\.]+)\s*([A-Za-z/%mgdL\^0-9]*)", line, re.IGNORECASE)
                if res_match:
                    r_num, _ = _try_parse_number(res_match.group(1))
                    r_units = res_match.group(2).strip() or None
                    records.append(
                        HL7ResultRecord(
                            barcode=current_obr_barcode,
                            test_name=current_obr_test_name,
                            result_numeric=r_num,
                            units=r_units,
                            status="completed",
                            raw_line=line,
                        )
                    )
                    current_obr_barcode = None

    return records
