"""OB-273: which responses stay out of search results."""

NOINDEX = "noindex, nofollow"


def is_business_hostname(hostname: str) -> bool:
    host = hostname.lower()
    return host.startswith("business.") or host.endswith(".run.app")


def is_demo_path(route: str) -> bool:
    """/demo and /explore/demo and everything under them, on every host."""
    route = route.rstrip("/") or "/"
    return any(route == p or route.startswith(p + "/") for p in ("/demo", "/explore/demo"))


def closed_to_search(host_header: str, path: str) -> bool:
    """Every business-host and *.run.app response, and the demo on every host."""
    hostname = host_header.rsplit(":", 1)[0] if not host_header.endswith("]") else host_header
    return is_business_hostname(hostname) or is_demo_path(path)
