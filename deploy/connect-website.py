"""Add the Training page link to the installed KryptWeb source."""

from pathlib import Path
from shutil import copy2, copymode
from tempfile import NamedTemporaryFile
import re
import sys


DESTINATION = b"https://www.kryptnet.org/training/"


def pages_with_launch(source):
    old_choice = b"const trainingUrl = s.launchUrl || localTrainingUrl;"
    new_choice = old_choice[:-1] + b" || '" + DESTINATION + b"';"
    if new_choice in source:
        return source
    if source.count(old_choice) == 1:
        return source.replace(old_choice, new_choice)

    marker = b"return head('Services / '+s.title,s.title,s.intro)+`<article class=\"detail\">"
    if source.count(marker) != 1:
        raise SystemExit("Could not locate the Training page template in pages.js.")
    launch = (
        b"${id==='training'?`<div class=\"actions\">${button('Launch Training Platform','"
        + DESTINATION + b"')}</div>`:''}"
    )
    if marker + launch in source:
        return source
    if b"Launch Training Platform" in source:
        raise SystemExit("pages.js already has a different training launch link.")
    return source.replace(marker, marker + launch)


def replace_with_backup(path, current, updated):
    if current == updated:
        return
    backup = path.with_name(path.name + ".before-training")
    if not backup.exists():
        copy2(path, backup)
    with NamedTemporaryFile(dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        output.write(updated)
    try:
        copymode(path, temporary)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


if len(sys.argv) != 2:
    raise SystemExit("Usage: connect-website.py /path/to/kryptnet-website")
website = Path(sys.argv[1])
pages_path, index_path = website / "pages.js", website / "index.html"
pages, index = pages_path.read_bytes(), index_path.read_bytes()
updated_pages = pages_with_launch(pages)
updated_index, count = re.subn(rb'src="pages\.js(?:\?v=[a-zA-Z0-9-]+)?"', b'src="pages.js?v=training-1"', index)
if count != 1:
    raise SystemExit("Could not locate the pages.js script in index.html.")
replace_with_backup(pages_path, pages, updated_pages)
replace_with_backup(index_path, index, updated_index)
print("Training page links to", DESTINATION.decode())
