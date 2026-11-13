"""Configure learner verification with the site's existing SMTP settings."""

from base64 import b64encode
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile


website = Path("/opt/kryptnet-services/kryptnet-website")
destination = Path(__file__).resolve().parent / ".env"
if not destination.is_file():
    raise SystemExit("The training deployment needs its existing .env file.")
original = destination.read_text()
secret = re.search(r"(?m)^TRAINING_CODE_SECRET=['\"]?([a-fA-F0-9]{64})['\"]?[ \t]*$", original)
def has_value(key):
    match = re.search(r"(?m)^" + re.escape(key) + r"=(.*)$", original)
    return match and bool(match[1].strip().strip("'\""))

if secret and (has_value("TRAINING_SMTP_CONFIG") or all(
    has_value("TRAINING_SMTP_" + field) for field in ("HOST", "USER", "PASSWORD")
)):
    print("Training mail settings are already configured.")
    raise SystemExit(0)

read_settings = """
import json, os
from pathlib import Path
fields = ('HOST', 'PORT', 'SECURITY', 'USER', 'PASSWORD', 'FROM')
config = {field: os.environ.get('SMTP_' + field, '') for field in fields}
if not config['PASSWORD'] and os.environ.get('SMTP_PASSWORD_FILE'):
    config['PASSWORD'] = Path(os.environ['SMTP_PASSWORD_FILE']).read_text().strip()
print(json.dumps(config))
"""
try:
    output = subprocess.check_output(
        ["docker", "compose", "exec", "-T", "app", "python", "-c", read_settings],
        cwd=website, text=True, stderr=subprocess.DEVNULL,
    )
    settings = json.loads(output)
except (OSError, subprocess.CalledProcessError, ValueError):
    raise SystemExit("Could not read SMTP settings from the website app. Configure training SMTP in .env.")
if not all(settings.get(field) for field in ("HOST", "USER", "PASSWORD")):
    raise SystemExit("Website SMTP authentication is incomplete. Configure training SMTP in .env.")

updates = {
    "TRAINING_SMTP_CONFIG": b64encode(json.dumps(settings).encode()).decode(),
    "TRAINING_CODE_SECRET": secret[1] if secret else secrets.token_hex(32),
}
lines = [line for line in original.splitlines() if line.split("=", 1)[0] not in updates]
lines.extend(f"{key}={value}" for key, value in updates.items())
current = destination.stat()
with tempfile.NamedTemporaryFile(mode="w", dir=destination.parent, prefix=".learner-mail-", delete=False) as file:
    temporary = Path(file.name)
    file.write("\n".join(lines) + "\n")
try:
    os.chown(temporary, current.st_uid, current.st_gid)
    temporary.chmod(0o600)
    temporary.replace(destination)
finally:
    temporary.unlink(missing_ok=True)
print("Configured learner verification using the website SMTP service.")
