import json
import os
import logging

import pika

logger = logging.getLogger(__name__)


def get_connection():
    url = os.getenv("RABBITMQ_URL")
    if url:
        return pika.BlockingConnection(pika.URLParameters(url))
    else:
        host = os.getenv("RABBITMQ_HOST", "localhost")
        port = int(os.getenv("RABBITMQ_PORT", 5672))
        user = os.getenv("RABBITMQ_USER", "admin")
        password = os.getenv("RABBITMQ_PASSWORD", "admin")
        credentials = pika.PlainCredentials(user, password)
        return pika.BlockingConnection(pika.ConnectionParameters(host, port, credentials=credentials))


def get_rabbitmq_channel():
    # Connect to a local broker
    connection = get_connection()
    channel = connection.channel()
    # Declare a queue (if not exists)
    channel.queue_declare(
        queue=os.environ["TASK_QUEUE"],
        arguments={"x-max-priority": int(os.environ["QUEUE_MAX_PRIORITY"])},
        durable=True,
    )
    return connection, channel


def publish_task(type: str, tries: int, data: dict, priority: int):
    """
    Publish a task to the queue.
    """
    try:
        connection, channel = get_rabbitmq_channel()
        channel.basic_publish(
            exchange="",
            routing_key=os.environ["TASK_QUEUE"],
            body=json.dumps({
                "type": type,
                "tries": tries,
                "data": data
            }),
            properties=pika.BasicProperties(
                delivery_mode=pika.DeliveryMode.Persistent,  # Make message persistent
                priority=priority,
            )
        )
        logger.info(f" [x] Published task: {type}, tries: {tries}, data: {data}")
    except Exception as e:
        logger.error(f"Error publishing task: {type}, tries: {tries}, data: {data}. Error: {e}")
        raise
    finally:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
