import os
import fnmatch

ROOT_PATH = os.getcwd()
OUTPUT_FILE = "project_file_structure.txt"


# Default ignored folders/files
IGNORE_LIST = {
    # Git
    ".git",
    ".github",

    # Python
    "venv",
    ".venv",
    "env",
    "__pycache__",
    "*.pyc",

    # Node
    "node_modules",
    ".next",
    "dist",
    "build",

    # IDE
    ".idea",
    ".vscode",

    # Cache
    ".cache",
    ".pytest_cache",

    # OS
    ".DS_Store",
    "Thumbs.db",

    # Logs
    "*.log",

    # Environment
    ".env",
    ".env.local",
}


def load_gitignore():
    """
    Load .gitignore rules if exists
    """
    gitignore_path = os.path.join(ROOT_PATH, ".gitignore")

    rules = []

    if os.path.exists(gitignore_path):
        with open(gitignore_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()

                if line and not line.startswith("#"):
                    rules.append(line)

    return rules


GITIGNORE_RULES = load_gitignore()


def should_ignore(name):

    # Check default ignores
    for pattern in IGNORE_LIST:
        if fnmatch.fnmatch(name, pattern):
            return True

    # Check .gitignore
    for rule in GITIGNORE_RULES:

        rule = rule.replace("/", "")

        if fnmatch.fnmatch(name, rule):
            return True

    return False



def generate_tree(path, prefix=""):

    result = []

    try:
        items = sorted(os.listdir(path))

    except PermissionError:
        return result


    items = [
        i for i in items
        if not should_ignore(i)
    ]


    for index, item in enumerate(items):

        full_path = os.path.join(path, item)

        last = index == len(items)-1

        connector = "└── " if last else "├── "

        result.append(
            f"{prefix}{connector}{item}"
        )


        if os.path.isdir(full_path):

            next_prefix = (
                prefix + ("    " if last else "│   ")
            )

            result.extend(
                generate_tree(
                    full_path,
                    next_prefix
                )
            )

    return result



output = [
    f"Project Root: {ROOT_PATH}",
    "",
]


output.extend(
    generate_tree(ROOT_PATH)
)


with open(
    OUTPUT_FILE,
    "w",
    encoding="utf-8"
) as f:

    f.write(
        "\n".join(output)
    )


print("✅ Completed")
print(f"📁 Saved: {OUTPUT_FILE}")
print(f"📄 Lines: {len(output)}")