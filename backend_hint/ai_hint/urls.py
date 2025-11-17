from django.urls import path

from . import views

app_name = "ai_hint"
urlpatterns = [
    path("add_request/", views.add_request, name="add_request_for_ai"),  # Orchestration backend adds request for AI hint
    path("add_reflection/", views.add_reflection, name="add_reflection_for_ai"),  # Orchestration backend adds reflection for AI hint
]