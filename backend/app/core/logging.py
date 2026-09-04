import logging
import re

import structlog

# Never let Telegram codes, 2FA passwords, session strings, or API secrets reach the logs.
_SENSITIVE_KEYS = {"password", "code", "phone_code", "session", "session_string", "api_hash", "secret", "token", "authorization"}
_SESSION_PATTERN = re.compile(r"1[A-Za-z0-9+/=_-]{300,}")


def _redact(_, __, event_dict):
    for key in list(event_dict.keys()):
        if key.lower() in _SENSITIVE_KEYS:
            event_dict[key] = "[REDACTED]"
    msg = event_dict.get("event")
    if isinstance(msg, str):
        event_dict["event"] = _SESSION_PATTERN.sub("[REDACTED_SESSION]", msg)
    return event_dict


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(level=level, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            _redact,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level)),
        logger_factory=structlog.PrintLoggerFactory(),
    )


def get_logger(name: str):
    return structlog.get_logger(name)
