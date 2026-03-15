--------------------------- MODULE InstallFlow -----------------------------
(* 
 * Formal specification of agentpack's compiler-driven install flow.
 *
 * Models the hard-cut architecture:
 *   1. fetch packages into node_modules
 *   2. compile canonical semantic state
 *   3. materialize runtime outputs from compiled state
 *
 * There is no legacy build-state or migration path in this model.
 * The canonical semantic truth is the compiled state.
 *)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS
    Packages,          \* Set of installable packages, e.g. {"X", "Y"}
    PackageDeps        \* Function: package -> set of transitive deps

VARIABLES
    phase,                \* "idle" | "fetch" | "compile" | "materialize" | "done"
    nodeModules,          \* Set of packages present in node_modules
    directInstalls,       \* Set of directly requested packages
    compiledState,        \* Canonical compiled closure
    materializationState, \* Recorded adapter ownership derived from compiled state
    claudeLinks,          \* Runtime outputs for claude adapter
    agentsLinks,          \* Runtime outputs for agents adapter
    requested,            \* Packages being installed in current operation
    resolved,             \* Resolved closure for current operation
    crashed               \* BOOLEAN - has there been a crash since last clean op?

vars == <<phase, nodeModules, directInstalls, compiledState, materializationState,
          claudeLinks, agentsLinks, requested, resolved, crashed>>

-----------------------------------------------------------------------------
(* Type invariant *)

AllPackages == Packages \union UNION {PackageDeps[p] : p \in Packages}

TypeOK ==
    /\ phase \in {"idle", "fetch", "compile", "materialize", "done"}
    /\ nodeModules \subseteq AllPackages
    /\ directInstalls \subseteq Packages
    /\ compiledState \subseteq AllPackages
    /\ materializationState \subseteq AllPackages
    /\ claudeLinks \subseteq AllPackages
    /\ agentsLinks \subseteq AllPackages
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
    /\ directInstalls = {}
    /\ compiledState = {}
    /\ materializationState = {}
    /\ claudeLinks = {}
    /\ agentsLinks = {}
    /\ requested = {}
    /\ resolved = {}
    /\ crashed = FALSE

-----------------------------------------------------------------------------
(* Actions *)

BeginInstall(pkgs) ==
    /\ phase = "idle"
    /\ pkgs /= {}
    /\ pkgs \subseteq Packages
    /\ phase' = "fetch"
    /\ requested' = pkgs
    /\ resolved' = {}
    /\ UNCHANGED <<nodeModules, directInstalls, compiledState, materializationState,
                   claudeLinks, agentsLinks, crashed>>

FetchPackages ==
    /\ phase = "fetch"
    /\ LET closure == Closure(requested \union directInstalls)
       IN /\ nodeModules' = nodeModules \union closure
          /\ resolved' = closure
    /\ phase' = "compile"
    /\ UNCHANGED <<directInstalls, compiledState, materializationState,
                   claudeLinks, agentsLinks, requested, crashed>>

CompileState ==
    /\ phase = "compile"
    /\ resolved /= {}
    /\ compiledState' = resolved
    /\ directInstalls' = requested \union directInstalls
    /\ phase' = "materialize"
    /\ UNCHANGED <<nodeModules, materializationState, claudeLinks, agentsLinks,
                   requested, resolved, crashed>>

Materialize ==
    /\ phase = "materialize"
    /\ claudeLinks' = compiledState
    /\ agentsLinks' = compiledState
    /\ materializationState' = compiledState
    /\ phase' = "done"
    /\ crashed' = FALSE
    /\ UNCHANGED <<nodeModules, directInstalls, compiledState, requested, resolved>>

CompleteInstall ==
    /\ phase = "done"
    /\ phase' = "idle"
    /\ requested' = {}
    /\ resolved' = {}
    /\ UNCHANGED <<nodeModules, directInstalls, compiledState, materializationState,
                   claudeLinks, agentsLinks, crashed>>

CrashDuringFetch ==
    /\ phase = "fetch"
    /\ \E partial \in SUBSET Closure(requested) :
        nodeModules' = nodeModules \union partial
    /\ phase' = "idle"
    /\ requested' = {}
    /\ resolved' = {}
    /\ crashed' = TRUE
    /\ UNCHANGED <<directInstalls, compiledState, materializationState,
                   claudeLinks, agentsLinks>>

CrashDuringCompile ==
    /\ phase = "compile"
    /\ phase' = "idle"
    /\ requested' = {}
    /\ resolved' = {}
    /\ crashed' = TRUE
    /\ UNCHANGED <<nodeModules, directInstalls, compiledState, materializationState,
                   claudeLinks, agentsLinks>>

CrashDuringMaterialize ==
    /\ phase = "materialize"
    /\ \E partialClaude \in SUBSET compiledState :
       \E partialAgents \in SUBSET compiledState :
           /\ claudeLinks' = partialClaude
           /\ agentsLinks' = partialAgents
    /\ phase' = "idle"
    /\ requested' = {}
    /\ resolved' = {}
    /\ crashed' = TRUE
    /\ UNCHANGED <<nodeModules, directInstalls, compiledState, materializationState>>

Uninstall(pkg) ==
    /\ phase = "idle"
    /\ pkg \in directInstalls
    /\ LET remaining == directInstalls \ {pkg}
           newClosure == Closure(remaining)
       IN
           /\ directInstalls' = remaining
           /\ compiledState' = newClosure
           /\ materializationState' = newClosure
           /\ claudeLinks' = newClosure
           /\ agentsLinks' = newClosure
           /\ crashed' = FALSE
    /\ UNCHANGED <<nodeModules, phase, requested, resolved>>

Next ==
    \/ \E pkgs \in (SUBSET Packages \ {{}}) : BeginInstall(pkgs)
    \/ FetchPackages
    \/ CompileState
    \/ Materialize
    \/ CompleteInstall
    \/ CrashDuringFetch
    \/ CrashDuringCompile
    \/ CrashDuringMaterialize
    \/ \E p \in Packages : Uninstall(p)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* INVARIANTS *)

CompiledMatchesDirectInstalls ==
    (phase = "idle" /\ ~crashed) =>
        compiledState = Closure(directInstalls)

MaterializationDerivedFromCompiled ==
    (phase = "idle" /\ ~crashed) =>
        materializationState = compiledState

RuntimeMatchesMaterializationState ==
    (phase = "idle" /\ ~crashed) =>
        /\ claudeLinks = materializationState
        /\ agentsLinks = materializationState

CompiledPackagesExist ==
    (phase = "idle" /\ ~crashed) =>
        compiledState \subseteq nodeModules

DirectSubsetOfCompiled ==
    (phase = "idle" /\ ~crashed) =>
        directInstalls \subseteq compiledState

CrashLeavesRecordedStateSelfConsistent ==
    (phase = "idle" /\ crashed) =>
        directInstalls \subseteq compiledState

RecoveryRestoresConsistency ==
    phase = "done" =>
        /\ materializationState = compiledState
        /\ claudeLinks = compiledState
        /\ agentsLinks = compiledState

=============================================================================
