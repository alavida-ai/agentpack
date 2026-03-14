--------------------------- MODULE InstallFlow -----------------------------
(*
 * Formal specification of agentpack's skill install flow.
 *
 * Models: installSkills() from lib/skills.js
 * and rebuildInstallState() from infrastructure/runtime/materialize-skills.js
 *
 * The install flow has three phases:
 *   1. npm install (fetch packages)
 *   2. Resolve dependency closure
 *   3. Create symlinks + write install.json (materialization)
 *
 * A crash can occur between any two phases, leaving the system in an
 * inconsistent state. The model checker verifies that:
 *   - After successful install, state matches filesystem
 *   - After crash + reinstall, state converges to consistent
 *   - No skill is materialized without being in install.json (after success)
 *)
EXTENDS Integers, FiniteSets, Sequences, TLC

CONSTANTS
    Packages,          \* Set of installable packages, e.g. {"X", "Y"}
    PackageDeps        \* Function: package -> set of transitive deps
                       \* e.g. [X |-> {}, Y |-> {X}]

VARIABLES
    \* Install process state
    phase,             \* "idle" | "npm_install" | "resolve" | "materialize" | "done"

    \* Filesystem state
    nodeModules,       \* Set of packages present in node_modules
    claudeLinks,       \* Set of packages with .claude/skills symlinks
    agentsLinks,       \* Set of packages with .agents/skills symlinks

    \* Recorded state
    installJson,       \* Set of packages recorded in install.json
    installJsonDirect, \* Set of packages marked as direct installs

    \* Install request
    requested,         \* Set of packages being installed in current operation
    resolved,          \* Set of packages in resolved closure (direct + transitive)

    \* Crash tracking
    crashed            \* BOOLEAN — has there been a crash since last successful op?

vars == <<phase, nodeModules, claudeLinks, agentsLinks,
          installJson, installJsonDirect, requested, resolved, crashed>>

-----------------------------------------------------------------------------
(* Type invariant *)

AllPackages == Packages \union UNION {PackageDeps[p] : p \in Packages}

TypeOK ==
    /\ phase \in {"idle", "npm_install", "resolve", "materialize", "done"}
    /\ nodeModules \subseteq AllPackages
    /\ claudeLinks \subseteq AllPackages
    /\ agentsLinks \subseteq AllPackages
    /\ installJson \subseteq AllPackages
    /\ installJsonDirect \subseteq AllPackages
    /\ requested \subseteq Packages
    /\ resolved \subseteq AllPackages
    /\ crashed \in BOOLEAN

-----------------------------------------------------------------------------
(* Helper: compute full closure of a set of packages *)

Closure(pkgs) ==
    pkgs \union UNION {PackageDeps[p] : p \in pkgs}

-----------------------------------------------------------------------------
(* Initial state: nothing installed *)

Init ==
    /\ phase = "idle"
    /\ nodeModules = {}
    /\ claudeLinks = {}
    /\ agentsLinks = {}
    /\ installJson = {}
    /\ installJsonDirect = {}
    /\ requested = {}
    /\ resolved = {}
    /\ crashed = FALSE

-----------------------------------------------------------------------------
(* Actions *)

(* User initiates install of a set of packages *)
BeginInstall(pkgs) ==
    /\ phase = "idle"
    /\ pkgs /= {}
    /\ pkgs \subseteq Packages
    /\ phase' = "npm_install"
    /\ requested' = pkgs
    /\ resolved' = {}
    /\ UNCHANGED <<nodeModules, claudeLinks, agentsLinks, installJson, installJsonDirect, crashed>>

(* Phase 1: npm install fetches packages into node_modules *)
NpmInstall ==
    /\ phase = "npm_install"
    /\ LET closure == Closure(requested \union installJsonDirect)
       IN  nodeModules' = nodeModules \union closure
    /\ phase' = "resolve"
    /\ UNCHANGED <<claudeLinks, agentsLinks, installJson, installJsonDirect, requested, resolved, crashed>>

(* Phase 2: Resolve dependency closure *)
ResolveClosure ==
    /\ phase = "resolve"
    /\ resolved' = Closure(requested \union installJsonDirect)
    /\ phase' = "materialize"
    /\ UNCHANGED <<nodeModules, claudeLinks, agentsLinks, installJson, installJsonDirect, requested, crashed>>

(* Phase 3: Create symlinks AND write install.json atomically *)
Materialize ==
    /\ phase = "materialize"
    \* Remove old symlinks, create new ones for entire resolved set
    /\ claudeLinks' = resolved
    /\ agentsLinks' = resolved
    \* Write install.json with complete state
    /\ installJson' = resolved
    /\ installJsonDirect' = requested \union installJsonDirect
    /\ phase' = "done"
    /\ crashed' = FALSE    \* successful materialization clears crash state
    /\ UNCHANGED <<nodeModules, requested, resolved>>

(* Install completes, return to idle *)
CompleteInstall ==
    /\ phase = "done"
    /\ phase' = "idle"
    /\ requested' = {}
    /\ resolved' = {}
    /\ UNCHANGED <<nodeModules, claudeLinks, agentsLinks, installJson, installJsonDirect, crashed>>

(* --- CRASH ACTIONS --- *)
(* A crash can happen at any non-idle phase *)

CrashDuringNpmInstall ==
    /\ phase = "npm_install"
    \* npm may have partially installed
    /\ \E partial \in SUBSET Closure(requested) :
        nodeModules' = nodeModules \union partial
    /\ phase' = "idle"
    /\ requested' = {}
    /\ resolved' = {}
    /\ crashed' = TRUE
    /\ UNCHANGED <<claudeLinks, agentsLinks, installJson, installJsonDirect>>

CrashDuringResolve ==
    /\ phase = "resolve"
    \* Resolution is in-memory, crash just loses it
    /\ phase' = "idle"
    /\ requested' = {}
    /\ resolved' = {}
    /\ crashed' = TRUE
    /\ UNCHANGED <<nodeModules, claudeLinks, agentsLinks, installJson, installJsonDirect>>

CrashDuringMaterialize ==
    /\ phase = "materialize"
    \* Partial symlinks may exist
    /\ \E partialClaude \in SUBSET resolved :
       \E partialAgents \in SUBSET resolved :
           /\ claudeLinks' = partialClaude
           /\ agentsLinks' = partialAgents
    \* install.json NOT written (crash before atomic write)
    /\ phase' = "idle"
    /\ requested' = {}
    /\ resolved' = {}
    /\ crashed' = TRUE
    /\ UNCHANGED <<nodeModules, installJson, installJsonDirect>>

(* --- UNINSTALL --- *)

Uninstall(pkg) ==
    /\ phase = "idle"
    /\ pkg \in installJsonDirect
    /\ LET remaining == installJsonDirect \ {pkg}
           newClosure == Closure(remaining)
       IN
           /\ claudeLinks' = newClosure
           /\ agentsLinks' = newClosure
           /\ installJson' = newClosure
           /\ installJsonDirect' = remaining
    /\ UNCHANGED <<nodeModules, phase, requested, resolved, crashed>>

Next ==
    \/ \E pkgs \in (SUBSET Packages \ {{}}) : BeginInstall(pkgs)
    \/ NpmInstall
    \/ ResolveClosure
    \/ Materialize
    \/ CompleteInstall
    \/ CrashDuringNpmInstall
    \/ CrashDuringResolve
    \/ CrashDuringMaterialize
    \/ \E p \in Packages : Uninstall(p)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* INVARIANTS *)

(* 1. After successful install (no crash), both link dirs match install.json *)
ConsistentAfterSuccess ==
    (phase = "idle" /\ ~crashed) =>
        /\ claudeLinks = installJson
        /\ agentsLinks = installJson

(* 2. install.json only contains packages that are in node_modules *)
InstalledPackagesExist ==
    (phase = "idle" /\ ~crashed) => installJson \subseteq nodeModules

(* 3. Direct installs are a subset of all installs *)
DirectSubsetOfAll ==
    ~crashed => (installJsonDirect \subseteq installJson \/ installJson = {})

(* 4. Materialization symmetry: claude and agents links always match (when clean) *)
MaterializationSymmetry ==
    (phase = "idle" /\ ~crashed) => claudeLinks = agentsLinks

(* 5. Closure completeness: if Y depends on X and Y is installed, X is too *)
ClosureComplete ==
    (phase = "idle" /\ ~crashed) =>
        \A p \in installJson :
            p \in Packages => PackageDeps[p] \subseteq installJson

(* 6. CRASH DETECTOR: after crash, filesystem CAN be inconsistent with state.
   This invariant DOCUMENTS the gap — orphaned symlinks can exist. *)
CrashCanCauseOrphans ==
    (phase = "idle" /\ crashed) =>
        \* At minimum, install.json is still valid on its own
        installJsonDirect \subseteq installJson \/ installJson = {}

(* 7. Recovery: a successful install after crash restores consistency.
   After Materialize completes, crashed is cleared and all invariants hold. *)
RecoveryRestoresConsistency ==
    phase = "done" =>
        /\ claudeLinks = resolved
        /\ agentsLinks = resolved

=============================================================================
