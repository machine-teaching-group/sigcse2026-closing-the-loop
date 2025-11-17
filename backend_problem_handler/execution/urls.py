from django.urls import path
from .views import execute_program, get_execution_result

app_name = "execution"

urlpatterns = [
    path("execute_program/", execute_program, name="execute_program"),
    path("get_execution_result/", get_execution_result, name="get_execution_result"),
]