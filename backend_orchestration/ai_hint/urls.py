from django.urls import path

from . import views

app_name = "ai_hint"
urlpatterns = [
    path("add_request/", views.add_request, name="add_request_for_ai"),  # Student frontend adds request for AI hint
    path("add_reflection/", views.add_reflection, name="add_reflection_for_ai_request"),  # Student frontend adds reflection for AI request
    path("query_hint/", views.query_hint, name="query_ai_hint"),  # Student frontend queries AI hint
    path("query_all_hint/", views.query_all_hint, name="query_all_ai_hints"),  # Student frontend queries all AI hints for a specific student and problem
    path("save/", views.save_hint, name="save_ai_hint"),  # Hint backend saves generated hint
    path("save_hint_rating/", views.save_hint_rating, name="save_ai_hint_rating"),  # Student rates hint
    path("quota_left/", views.quota_left, name="quota_left"),  # Remaining quota endpoint
    path("has_ever_requested/", views.has_ever_requested, name="has_ever_requested"),  # Check if student ever requested any hint
    path("cancel_request/", views.cancel_request, name="cancel_request"),  # Mark a request as cancelled
]
