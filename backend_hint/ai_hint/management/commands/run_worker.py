import json
import os
import time
import logging
import pika
from django.core.management.base import BaseCommand

from ai_hint.workers.task_processors import process_task
from ai_hint.utils.queue_utils import get_connection

logger = logging.getLogger(__name__)


def callback(ch, method, properties, body):
    logger.info(f" [x] Worker callback received `{str(body)[:120]}`")
    args = json.loads(body)

    process_task(args)

    ch.basic_ack(delivery_tag=method.delivery_tag)
    logger.info(f" [x] Worker has done processing request {str(args)[:120]}")


class Command(BaseCommand):
    help = "Run a RabbitMQ task worker"

    def add_arguments(self, parser):
        parser.add_argument("--queue", default=os.getenv("TASK_QUEUE", "task_queue"))
        parser.add_argument("--max-priority", type=int, default=int(os.getenv("QUEUE_MAX_PRIORITY", "3")))
        parser.add_argument("--prefetch", type=int, default=1)
        parser.add_argument("--reconnect-delay", type=int, default=3)


    def handle(self, *args, **options):
        queue = options["queue"]
        max_priority = options["max_priority"]
        prefetch = options["prefetch"]
        reconnect_delay = options["reconnect_delay"]

        self.stdout.write(self.style.SUCCESS(
            f"Worker starting (queue={queue}, max_priority={max_priority})"
        ))

        while True:
            try:
                # Connect to a local broker
                connection = get_connection()
                channel = connection.channel()

                # Declare the task queue
                channel.queue_declare(
                    queue=queue,
                    durable=True,
                    arguments={"x-max-priority": max_priority},
                )

                # Set QoS and consume messages
                channel.basic_qos(prefetch_count=prefetch)
                channel.basic_consume(queue=queue, on_message_callback=callback)
                logger.info(f"Worker consuming on '{queue}'...")
                channel.start_consuming()
            
            except (pika.exceptions.AMQPConnectionError, OSError):
                logger.warning(f"RabbitMQ not reachable. Retry in {reconnect_delay}s")
                time.sleep(reconnect_delay)
            except KeyboardInterrupt:
                logger.info("Worker interrupted. Exiting.")
                try:
                    connection.close()
                except Exception:
                    pass
                break
            except Exception:
                logger.exception("Unexpected worker error. Restarting in %ss", reconnect_delay)
                time.sleep(reconnect_delay)