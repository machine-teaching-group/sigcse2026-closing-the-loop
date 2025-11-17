from django.urls import path

from . import views

app_name = "instructor_feedback"
urlpatterns = [
    path("add_request/", views.add_request, name="add_request_for_instructor"),  # Student frontend adds request for instructor feedback
    path("query_feedback/", views.query_feedback, name="query_instructor_feedback"),  # Student frontend queries instructor feedback
    path("query_all_feedback/", views.query_all_feedback, name="query_all_instructor_feedback"),  # Student frontend queries all instructor feedback for a specific student and problem
    path("fetch_request/", views.fetch_request, name="fetch_request_for_instructor"),  # Instructor frontend fetches request for feedback
    path("save_feedback/", views.save_feedback, name="save_instructor_feedback"),  # Instructor frontend saves feedback
    path("save_feedback_rating/", views.save_feedback_rating, name="save_feedback_rating"),  # Student rates instructor feedback
]
