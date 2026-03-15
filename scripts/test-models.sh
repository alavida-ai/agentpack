#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TLA_DIR="${REPO_ROOT}/tla"
JAR_PATH="$(bash "${SCRIPT_DIR}/setup-tla.sh")"

run_model() {
  local model="$1"
  local cfg="$2"
  local state_root="${REPO_ROOT}/.cache/tla/states"
  local prefix="${model%.tla}"
  local metadir

  mkdir -p "${state_root}"
  metadir="$(mktemp -d "${state_root}/${prefix}-XXXXXX")"

  (
    cd "${TLA_DIR}"
    java -XX:+UseParallelGC -cp "${JAR_PATH}" tlc2.TLC \
      -metadir "${metadir}" \
      -workers auto \
      "${model}" \
      -config "${cfg}"
  )
}

run_model "MC_InstallFlow.tla" "MC_InstallFlow.cfg"
run_model "MC_DevSession.tla" "MC_DevSession.cfg"
run_model "MC_SkillStatus.tla" "MC_SkillStatus.cfg"
