from jupyter_server.extension.application import ExtensionApp
from .handlers import RouteHandler

class HintBotApp(ExtensionApp):
    name = "hintbot"
    jobs = {}

    def initialize_handlers(self):
        try:
            self.handlers.extend([(r"/hintbot/(.*)", RouteHandler)])
        except Exception as e:
            self.log.error(str(e))
            raise e
