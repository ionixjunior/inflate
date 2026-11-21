"""Checks the release notes and docs criteria (25-27) of plan.md against the files in the repo.

Usage: python3 .specs/features/multi-platform-support/proofs/docs.py <changelog|readme|troubleshooting|limitations>
Exits 0 and prints `ok <what>` when the files hold what the criterion fixes, 1 with the mismatch.
"""
import re
import sys
import textwrap

PLAN = ".specs/features/multi-platform-support/plan.md"
FENCE = "\x60\x60\x60"

PLATFORM_SENTENCE = ("Inflate runs on macOS (Apple Silicon and Intel), Windows x64 and Linux x64. "
                     "Windows on Arm and Linux on Arm are not supported.")

JDK_ORDER = {
    "macOS": ["inflate.javaHome", "JAVA_HOME", "PATH", "/usr/libexec/java_home -V", "Homebrew", "SDKMAN",
              "Android Studio", "/Library/Java/JavaVirtualMachines/*"],
    "Windows": ["inflate.javaHome", "JAVA_HOME", "PATH", "%ProgramFiles%\\Java\\*", "%ProgramFiles%\\Microsoft\\jdk-*",
                "%ProgramFiles%\\Eclipse Adoptium\\*", "%ProgramFiles%\\Zulu\\*",
                "%ProgramFiles%\\Android\\Android Studio\\jbr"],
    "Linux": ["inflate.javaHome", "JAVA_HOME", "PATH", "/usr/lib/jvm/*", "~/.sdkman/candidates/java/*",
              "/opt/android-studio/jbr", "~/android-studio/jbr"],
}


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def fail(msg):
    print(f"FAIL {msg}")
    sys.exit(1)


def section(text, heading_re):
    """The text under the first heading matching heading_re, up to the next heading of the same or a
    higher level."""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        m = re.match(r"^(#+)\s+(.*)$", line)
        if m and re.search(heading_re, m.group(2)):
            level = len(m.group(1))
            body = []
            for nxt in lines[i + 1:]:
                n = re.match(r"^(#+)\s", nxt)
                if n and len(n.group(1)) <= level:
                    break
                body.append(nxt)
            return "\n".join(body)
    return None


def changelog():
    plan = read(PLAN)
    m = re.search(FENCE + r"markdown\n(.*?)\n\s*" + FENCE, plan, re.S)
    if not m:
        fail("no markdown block in plan.md")
    expected = textwrap.dedent(m.group(1)).strip("\n") + "\n"
    log = read("extension/CHANGELOG.md")
    first = log.find("\n## ")
    if first < 0:
        fail("CHANGELOG.md has no ## section")
    if not log[first + 1:].startswith(expected):
        fail("CHANGELOG.md does not open with the plan's ## 1.1.0 section")
    print("ok changelog: extension/CHANGELOG.md opens with the ## 1.1.0 section of criterion 25")


def readme():
    for path in ("extension/README.md", "README.md"):
        text = read(path)
        if PLATFORM_SENTENCE not in text:
            fail(f"{path} lacks the platform sentence")
        quick = section(text, r"^Quickstart\b")
        if quick is None:
            fail(f"{path} has no Quickstart section")
        if not re.search(r"Cmd\+Shift\+P`? on macOS", quick):
            fail(f"{path} Quickstart does not name Cmd+Shift+P on macOS")
        if not re.search(r"Ctrl\+Shift\+P`? on Windows and Linux", quick):
            fail(f"{path} Quickstart does not name Ctrl+Shift+P on Windows and Linux")
    print("ok readme: both READMEs state the platforms and name both Command Palette shortcuts")


def troubleshooting():
    text = read("docs/troubleshooting.md")
    jdk = section(text, r"No compatible JDK found")
    if jdk is None:
        fail("docs/troubleshooting.md has no 'No compatible JDK found' section")
    for os_name, order in JDK_ORDER.items():
        m = re.search(r"^\s*-\s+\*\*" + os_name + r"\*\*:(.*?)(?=^\s*-\s+\*\*|\Z)", jdk, re.S | re.M)
        if not m:
            fail(f"no '- **{os_name}**:' item in the JDK section")
        item = m.group(1)
        pos = 0
        for source in order:
            found = item.find(source, pos)
            if found < 0:
                fail(f"{os_name}: '{source}' missing or out of order")
            pos = found + len(source)
    print("ok troubleshooting: the JDK search order of macOS, Windows and Linux is listed in order")


def limitations():
    text = read("docs/limitations.md")
    if "Windows and Linux are not supported in v1" in text:
        fail("docs/limitations.md still says Windows and Linux are not supported in v1")
    if "Windows on Arm and Linux on Arm are not supported" not in text:
        fail("docs/limitations.md lacks the Arm limitation")
    print("ok limitations: the v1 bullet is gone and the Arm limitation is listed")


if __name__ == "__main__":
    {"changelog": changelog, "readme": readme, "troubleshooting": troubleshooting,
     "limitations": limitations}[sys.argv[1]]()
