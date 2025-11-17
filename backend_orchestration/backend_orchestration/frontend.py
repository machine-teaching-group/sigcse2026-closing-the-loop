from django.http import HttpResponseRedirect, HttpResponse
from django.template import loader
from django.template.exceptions import TemplateDoesNotExist
from django.conf import settings


def _serve_spa(template_name: str, dev_fallback: str):
    """
    Try to render a built SPA template. If not found (common in local dev),
    redirect to the Vite dev server for a seamless experience.
    """
    try:
        template = loader.get_template(template_name)
        return HttpResponse(template.render({}, None))
    except TemplateDoesNotExist:
        # Local dev convenience: fall back to running Vite dev server
        return HttpResponseRedirect(dev_fallback)


def student_spa(request):
    # Default Vite dev server
    dev_url = getattr(settings, 'STUDENT_DEV_URL', 'http://localhost:5173/')
    return _serve_spa('student/index.html', dev_url)


def instructor_spa(request):
    dev_url = getattr(settings, 'INSTRUCTOR_DEV_URL', 'http://localhost:5174/')
    return _serve_spa('instructor/index.html', dev_url)
