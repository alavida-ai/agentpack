#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DEFAULT_CACHE_DIR="${REPO_ROOT}/.cache/tla"
DEFAULT_JAR_PATH="${DEFAULT_CACHE_DIR}/tla2tools.jar"
DEFAULT_DOWNLOAD_URL="https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar"

JAR_PATH="${TLA_TOOLS_JAR:-${DEFAULT_JAR_PATH}}"
DOWNLOAD_URL="${TLA_TOOLS_URL:-${DEFAULT_DOWNLOAD_URL}}"

mkdir -p "$(dirname "${JAR_PATH}")"

if [[ ! -f "${JAR_PATH}" ]]; then
  echo "Downloading TLA+ tools to ${JAR_PATH}" >&2
  curl -fsSL "${DOWNLOAD_URL}" -o "${JAR_PATH}"
fi

echo "${JAR_PATH}"
