"""Small helpers for consistent JSON errors and input validation."""
from flask import jsonify


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def error_response(message: str, status: int):
    return jsonify({"ok": False, "error": message, "status": status}), status


def clean_text(value, field: str, max_len: int, required: bool = True) -> str:
    if value is None:
        if required:
            raise ApiError(f"'{field}' maydoni majburiy")
        return ""
    if not isinstance(value, str):
        raise ApiError(f"'{field}' matn bo‘lishi kerak")
    value = " ".join(value.split())  # collapse whitespace, strip control newlines
    if required and not value:
        raise ApiError(f"'{field}' bo‘sh bo‘lmasligi kerak")
    if len(value) > max_len:
        raise ApiError(f"'{field}' {max_len} belgidan oshmasligi kerak")
    return value


def choice(value, field: str, allowed, default=None):
    if value in (None, ""):
        return default
    if value not in allowed:
        raise ApiError(f"'{field}' noto‘g‘ri qiymat: {value}. Ruxsat etilgan: {', '.join(allowed)}")
    return value


def positive_int(value, field: str, default: int, maximum: int) -> int:
    if value in (None, ""):
        return default
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ApiError(f"'{field}' butun son bo‘lishi kerak") from None
    if number < 0:
        raise ApiError(f"'{field}' manfiy bo‘lmasligi kerak")
    return min(number, maximum)
