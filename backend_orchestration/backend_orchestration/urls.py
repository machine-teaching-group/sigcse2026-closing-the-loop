"""
URL configuration for backend_orchestration project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include, re_path
from .frontend import student_spa, instructor_spa

urlpatterns = [
    path('admin/', admin.site.urls),
    path("ai_hint/", include("ai_hint.urls")),
    path("instructor_feedback/", include("instructor_feedback.urls")),
    path("problems/", include("problems.urls")),
    # SPAs with dev fallback when build is missing. This should work for both cases: (1) local dev and (2) deployment with frontends built with this backend.
    path('student/', student_spa, name='student-app'),
    re_path(r'^student/.+$', student_spa),
    path('instructor/', instructor_spa, name='instructor-app'),
    re_path(r'^instructor/.+$', instructor_spa),
]


