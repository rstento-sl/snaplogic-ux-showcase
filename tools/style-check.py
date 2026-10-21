#!/usr/bin/env python3
"""Flag banned terms and passive voice in showcase prose before a push.

Reads the A-Z list in ~/Git/usability-review-criteria.md (Appendix 1), pulls out
every term marked "do not use" / "don't use" / "avoid", and greps the visible
text of the repo's HTML and the prose fields of issues.json for them.

    python3 tools/style-check.py                # whole repo
    python3 tools/style-check.py apim-3/        # one folder or file
    python3 tools/style-check.py --no-passive   # banned terms only

Exit code 1 when anything is flagged, so it can gate a commit.
Every hit needs a decision: rewrite it, or say why it stands. "see" meaning
perceive ("you can't see the full value") is fine; "see X" as a cross-reference
is not. The script can't tell those apart — you have to read each line.
"""

import json
import pathlib
import re
import sys

CRITERIA = pathlib.Path.home() / "Git" / "usability-review-criteria.md"
REPO = pathlib.Path(__file__).resolve().parent.parent

# Terms the A-Z list bans outright but that are too noisy or too context-bound
# to flag mechanically.
SKIP = {"on", "opens", "now", "must", "fail", "given", "like", "dashes", "hyphen"}

PASSIVE = re.compile(
    r"\b(is|are|was|were|be|been|being)\s+(\w+ed|written|shown|given|known|seen|taken|made|built|held|drawn)\b",
    re.I,
)

# Strip anything that isn't prose a reader sees.
SCRIPT_OR_STYLE = re.compile(r"<(script|style)\b.*?</\1>", re.S | re.I)
TAG = re.compile(r"<[^>]+>")
ENTITY = re.compile(r"&[a-z]+;|&#\d+;", re.I)


def banned_terms():
    """Parse Appendix 1 into {term: guidance} for every banned entry."""
    if not CRITERIA.exists():
        sys.exit(f"Criteria file not found: {CRITERIA}")
    text = CRITERIA.read_text(encoding="utf-8")
    appendix = text.split("## Appendix 1: A-Z list of terms", 1)[-1]
    terms = {}
    for line in appendix.splitlines():
        m = re.match(r"-\s+\*\*(.+?)\*\*\s+—\s+(.*)", line.strip())
        if not m:
            continue
        term, guidance = m.group(1), m.group(2)
        if not re.match(r"(do not use|don't use|avoid)\b", guidance, re.I):
            continue
        # "because — don't use *since* to mean *because*" bans the italicized
        # word, not the headword. Those entries name the replacement, so skip them.
        if re.match(r"(do not|don't) use \*", guidance, re.I):
            continue
        term = term.strip().lower()
        if term and term not in SKIP and len(term) > 1:
            terms[term] = guidance
    return terms


def prose_lines(path):
    """Yield (line_number, text) of reader-visible prose in one file."""
    raw = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix == ".json":
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return
        wanted = {"title", "summary", "problem", "fix", "callout", "screen", "category"}
        lines = raw.splitlines()
        for i, line in enumerate(lines, 1):
            m = re.match(r'\s*"(\w+)"\s*:\s*"(.*)"', line)
            if m and m.group(1) in wanted:
                yield i, m.group(2)
        return
    stripped = SCRIPT_OR_STYLE.sub(lambda m: "\n" * m.group(0).count("\n"), raw)
    for i, line in enumerate(stripped.splitlines(), 1):
        text = ENTITY.sub(" ", TAG.sub(" ", line)).strip()
        if text:
            yield i, text


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check_passive = "--no-passive" not in sys.argv
    roots = [pathlib.Path(a) for a in args] or [REPO]

    files = []
    for root in roots:
        root = root if root.is_absolute() else pathlib.Path.cwd() / root
        if root.is_file():
            files.append(root)
        else:
            files += sorted(p for p in root.rglob("*") if p.suffix in {".html", ".json"})

    terms = banned_terms()
    patterns = {t: re.compile(rf"\b{re.escape(t)}\b", re.I) for t in terms}

    hits = 0
    for path in files:
        if ".git" in path.parts:
            continue
        for lineno, text in prose_lines(path):
            flagged = [f"{t} — {terms[t]}" for t, p in patterns.items() if p.search(text)]
            if check_passive:
                for m in PASSIVE.finditer(text):
                    flagged.append(f'passive: "{m.group(0)}" — name who does the action')
            for note in flagged:
                hits += 1
                rel = path.relative_to(REPO) if REPO in path.parents else path
                print(f"{rel}:{lineno}: {note}")
                print(f"    {text[:160]}")

    print(f"\n{hits} to review across {len(files)} files.")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
