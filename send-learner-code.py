"""Deliver a Training Labs confirmation code over authenticated SMTP."""

from email.message import EmailMessage
import json
import os
import smtplib
import ssl
import sys


details = json.load(sys.stdin)
host = os.environ["TRAINING_SMTP_HOST"]
port = int(os.environ.get("TRAINING_SMTP_PORT") or "587")
user = os.environ["TRAINING_SMTP_USER"]
password = os.environ["TRAINING_SMTP_PASSWORD"]
security = os.environ.get("TRAINING_SMTP_SECURITY") or "starttls"
context = ssl.create_default_context()

message = EmailMessage()
message["From"] = os.environ.get("TRAINING_SMTP_FROM") or user
message["To"] = details["email"]
message["Subject"] = "KryptNet Training Labs verification code"
action = "reset your password" if details["purpose"] == "reset" else "verify your email address"
message.set_content(
    f"Your code to {action} is {details['code']}.\n\n"
    "Enter it in KryptNet Training Labs within 10 minutes. "
    "If you did not request this code, you can ignore this email."
)

if security == "ssl":
    client = smtplib.SMTP_SSL(host, port, timeout=8, context=context)
elif security == "starttls":
    client = smtplib.SMTP(host, port, timeout=8)
else:
    raise SystemExit("Unsupported SMTP security mode")
with client:
    if security == "starttls":
        client.starttls(context=context)
    client.login(user, password)
    client.send_message(message)
