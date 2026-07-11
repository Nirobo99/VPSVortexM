from app.api import admin_auth, admin_panel, complaints, public_pages

# Legacy module kept for imports; routes moved to admin_panel.py
from app.api.admin_panel import router

__all__ = ["router"]
