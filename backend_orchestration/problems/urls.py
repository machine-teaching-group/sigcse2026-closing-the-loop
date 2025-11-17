from django.urls import path

from . import views

app_name = "problems"
urlpatterns = [
    path("programming_problems/", views.query_programming_problems, name="query_programming_problems"),  # Query all or single programming problem
    path("execute_program/", views.execute_program, name="execute_program"),  # Execute student program against test cases
    path("get_execution_result/", views.get_execution_result, name="get_execution_result"),  # Handle polling for execution result
]