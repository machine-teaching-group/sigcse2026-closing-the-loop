import os
import re
import smtplib
from email.mime.text import MIMEText
from typing import Optional
import logging


logger = logging.getLogger(__name__)


def send_email(sender_email, sender_password, recipient_email, subject, body):
    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = sender_email
    msg['To'] = recipient_email
    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp_server:
        smtp_server.login(sender_email, sender_password)
        logger.info("Successfully logged in to email server!")
        smtp_server.sendmail(sender_email, recipient_email, msg.as_string())
        logger.info("Email sent!")
