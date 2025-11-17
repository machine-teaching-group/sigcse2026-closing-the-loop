from django.urls import path

from . import views

app_name = "query"
urlpatterns = [
    path("programming_problems/", views.query_programming_problems, name="query_programming_problems"),
]