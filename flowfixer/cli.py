"""flowfixer CLI entrypoint."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from flowfixer import __version__
from flowfixer.analyze import analyze_har, print_analysis
from flowfixer.sanitize import sanitize_file


def _cmd_sanitize(args: argparse.Namespace) -> int:
    src = Path(args.har)
    if not src.exists():
        print(f"not found: {src}", file=sys.stderr)
        return 2
    dst = Path(args.output) if args.output else src.with_name(src.stem + ".SANITIZED.har")
    stats = sanitize_file(src, dst, scrub_tokens=not args.keep_tokens)
    print(f"Wrote {dst} ({stats['out_bytes']/1e6:.2f} MB from {stats['in_bytes']/1e6:.2f} MB)")
    print(
        f"entries={stats['entries']} headers={stats['headers']} "
        f"cookies={stats['cookies']} qs={stats['qs']} "
        f"b64_blobs={stats['b64_blobs']} tokens={stats['tokens']} "
        f"project_ids={stats.get('project_ids', 0)} "
        f"session_ids={stats.get('session_ids', 0)} "
        f"credit_nums={stats.get('credit_nums', 0)}"
    )
    return 0


def _cmd_analyze(args: argparse.Namespace) -> int:
    src = Path(args.har)
    if not src.exists():
        print(f"not found: {src}", file=sys.stderr)
        return 2
    a = analyze_har(src)
    print_analysis(a)
    return 0


def _cmd_report(args: argparse.Namespace) -> int:
    src = Path(args.har)
    if not src.exists():
        print(f"not found: {src}", file=sys.stderr)
        return 2
    a = analyze_har(src)
    md = a.to_markdown()
    if args.output:
        Path(args.output).write_text(md, encoding="utf-8")
        print(f"Wrote {args.output}")
    else:
        print(md)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="flowfixer",
        description="Reliability toolkit for Google Flow HAR captures.",
    )
    p.add_argument("--version", action="version", version=f"flowfixer {__version__}")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("sanitize", help="Redact secrets from a HAR for sharing")
    s.add_argument("har", help="Input .har path")
    s.add_argument("-o", "--output", help="Output path (default: *.SANITIZED.har)")
    s.add_argument(
        "--keep-tokens",
        action="store_true",
        help="Keep reCAPTCHA token strings (default: redact token values)",
    )
    s.set_defaults(func=_cmd_sanitize)

    a = sub.add_parser("analyze", help="Classify throttles and measure UI fan-out")
    a.add_argument("har", help="Input .har path (prefer sanitized)")
    a.set_defaults(func=_cmd_analyze)

    r = sub.add_parser("report", help="Write a markdown incident report")
    r.add_argument("har", help="Input .har path")
    r.add_argument("-o", "--output", help="Output .md path (default: stdout)")
    r.set_defaults(func=_cmd_report)

    return p


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    code = args.func(args)
    raise SystemExit(code)


if __name__ == "__main__":
    main()
