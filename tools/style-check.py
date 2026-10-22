#!/usr/bin/env python3
"""Run the shared style checker from the usability-review skill.

The implementation used to live here. It now lives in the skill, next to the A-Z
list it reads, so the term list and the checker can't drift apart:

    ~/Git/Working/ditasrc/skills/usability-review/tools/style-check.py

This wrapper stays so `python3 tools/style-check.py <path>` keeps working from
the showcase repo. It passes every argument straight through, and defaults to
scanning this repo when you don't name a path.

    python3 tools/style-check.py                # whole repo
    python3 tools/style-check.py apim-3/        # one folder or file
    python3 tools/style-check.py --no-passive   # banned terms only

If you cloned ditasrc somewhere other than ~/Git/Working/ditasrc, set
DITASRC to point at it.
"""

import os
import pathlib
import runpy
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
DITASRC = pathlib.Path(
    os.environ.get("DITASRC", pathlib.Path.home() / "Git" / "Working" / "ditasrc")
).expanduser()
CHECKER = DITASRC / "skills" / "usability-review" / "tools" / "style-check.py"

if not CHECKER.is_file():
    sys.exit(
        f"Shared style checker not found at:\n  {CHECKER}\n\n"
        "It lives in the usability-review skill in the ditasrc repo:\n"
        "  git clone git@github.com:snaplogic-docs/ditasrc.git ~/Git/Working/ditasrc\n"
        "Or set DITASRC to your clone's path."
    )

args = sys.argv[1:]

# Work out whether the caller named a path, before adding flags of our own.
FLAGS_WITH_VALUES = {"--ext", "--criteria"}
paths, skip = [], False
for arg in args:
    if skip:
        skip = False
    elif arg in FLAGS_WITH_VALUES:
        skip = True
    elif not arg.startswith("--"):
        paths.append(arg)

# This repo's reader-facing prose is the HTML and the prose fields of
# issues.json. The shared checker scans Markdown and DITA too, which here would
# only flag our own READMEs and notes, so narrow it unless asked otherwise.
if "--ext" not in args:
    args += ["--ext", ".html,.json"]

# Default to this repo rather than the current directory, which is what the
# original script did and what the instructions in CLAUDE.md assume.
if not paths:
    args.append(str(REPO))

sys.argv = [str(CHECKER), *args]
runpy.run_path(str(CHECKER), run_name="__main__")
