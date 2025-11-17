try:
    from ._version import __version__
except ImportError:
    # Fallback when using the package in dev mode without installing
    # in editable mode with pip. It is highly recommended to install
    # the package from a stable release or in editable mode: https://pip.pypa.io/en/stable/topics/local-project-installs/#editable-installs
    import warnings
    warnings.warn("Importing 'hintbot' outside a proper installation.")
    __version__ = "dev"

from .application import HintBotApp

def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": "hintbot"
    }]


def _jupyter_server_extension_points():
    return [{
        "module": "hintbot",
        "app": HintBotApp
    }]

load_jupyter_server_extension = HintBotApp.load_classic_server_extension
