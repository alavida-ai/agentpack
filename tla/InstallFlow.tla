--------------------------- MODULE InstallFlow -----------------------------
(* 
 * Formal specification of agentpack's runtime activation flow.
 *
 * Models the hard-cut architecture:
 *   1. npm manages package presence in node_modules
 *   2. agentpack compiles enabled package closure into semantic state
 *   3. agentpack materializes runtime outputs from compiled state
 *
 * There is no agentpack-managed package fetch or uninstall path in this model.
 * The canonical semantic truth for activation is the compiled state derived
 * from enabled direct packages already present in node_modules.
 *)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS
    Packages,          \* Set of installable packages, e.g. {"X", "Y"}
    PackageDeps        \* Function: package -> set of transitive deps

VARIABLES
    phase,                \* "idle" | "compile-enable" | "compile-disable" | "materialize" | "done"
    nodeModules,          \* Set of packages present in node_modules
    directEnabled,        \* Set of directly enabled packages
    compiledState,        \* Canonical compiled closure
    materializationState, \* Recorded adapter ownership derived from compiled state
    claudeLinks,          \* Runtime outputs for claude adapter
    agentsLinks,          \* Runtime outputs for agents adapter
    requested,            \* Packages being enabled or disabled in current operation
    resolved,             \* Resolved closure for current operation
    crashed               \* BOOLEAN - has there been a crash since last clean op?

vars == <<phase, nodeModules, directEnabled, compiledState, materializationState,
          claudeLinks, agentsLinks, requested, resolved, crashed>>

-----------------------------------------------------------------------------
(* Type invariant *)

AllPackages == Packages \union UNION {PackageDeps[p] : p \in Packages}

TypeOK ==
    /\ phase \in {"idle", "compile-enable", "compile-disable", "materialize", "done"}
    /\ nodeModules \subseteq AllPackages
    /\ directEnabled \subseteq Packages
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
    /\ directEnabled = {}
    /\ compiledState = {}
    /\ materializationState = {}
    /\ claudeLinks = {}
    /\ agentsLinks = {}
    /\ requested = {}
    /\ resolved = {}
    /\ crashed = FALSE

-----------------------------------------------------------------------------
(* Actions *)

NpmInstall(pkgs) ==
    /\ phase = "idle"
    /\ pkgs /= {}
    /\ pkgs \subseteq Packages
    /\ nodeModules' = nodeModules \union Closure(pkgs)
    /\ UNCHANGED <<phase, directEnabled, compiledState, materializationState,
                   claudeLinks, agentsLinks, requested, resolved, crashed>>

BeginEnable(pkgs) ==
    /\ phase = "idle"
    /\ pkgs /= {}
    /\ pkgs \subseteq Packages
    /\ Closure(pkgs \union directEnabled) \subseteq nodeModules
    /\ phase' = "compile-enable"
    /\ requested' = pkgs
    /\ resolved' = {}
    /\ UNCHANGED <<nodeModules, directEnabled, compiledState, materializationState,
                   claudeLinks, agentsLinks, crashed>>

CompileEnable ==
    /\ phase = "compile-enable"
    /\ requested /= {}
    /\ LET closure == Closure(requested \union directEnabled)
       IN /\ resolved' = closure
          /\ compiledState' = closure
          /\ directEnabled' = requested \union directEnabled
    /\ phase' = "materialize"
    /\ UNCHANGED <<nodeModules, materializationState, claudeLinks, agentsLinks,
                   requested, crashed>>

BeginDisable(pkgs) ==
    /\ phase = "idle"
    /\ pkgs /= {}
    /\ pkgs \subseteq directEnabled
    /\ phase' = "compile-disable"
    /\ requested' = pkgs
    /\ resolved' = {}
    /\ UNCHANGED <<nodeModules, directEnabled, compiledState, materializationState,
                   claudeLinks, agentsLinks, crashed>>

CompileDisable ==
    /\ phase = "compile-disable"
    /\ requested /= {}
    /\ LET remaining == directEnabled \ requested
           closure == Closure(remaining)
       IN /\ compiledState' = closure
          /\ directEnabled' = remaining
          /\ resolved' = closure
    /\ phase' = "materialize"
    /\ UNCHANGED <<nodeModules, materializationState, claudeLinks, agentsLinks,
                   requested, crashed>>

Materialize ==
    /\ phase = "materialize"
    /\ claudeLinks' = compiledState
    /\ agentsLinks' = compiledState
    /\ materializationState' = compiledState
    /\ phase' = "done"
    /\ crashed' = FALSE
    /\ UNCHANGED <<nodeModules, directEnabled, compiledState, requested, resolved>>

CompleteInstall ==
    /\ phase = "done"
    /\ phase' = "idle"
    /\ requested' = {}
    /\ resolved' = {}
    /\ UNCHANGED <<nodeModules, directEnabled, compiledState, materializationState,
                   claudeLinks, agentsLinks, crashed>>

CrashDuringEnableCompile ==
    /\ phase = "compile-enable"
    /\ phase' = "idle"
    /\ requested' = {}
    /\ resolved' = {}
    /\ crashed' = TRUE
    /\ UNCHANGED <<nodeModules, directEnabled, compiledState, materializationState,
                   claudeLinks, agentsLinks>>

CrashDuringDisableCompile ==
    /\ phase = "compile-disable"
    /\ phase' = "idle"
    /\ requested' = {}
    /\ resolved' = {}
    /\ crashed' = TRUE
    /\ UNCHANGED <<nodeModules, directEnabled, compiledState, materializationState,
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
    /\ UNCHANGED <<nodeModules, directEnabled, compiledState, materializationState>>

Next ==
    \/ \E pkgs \in (SUBSET Packages \ {{}}) : NpmInstall(pkgs)
    \/ \E pkgs \in (SUBSET Packages \ {{}}) : BeginEnable(pkgs)
    \/ CompileEnable
    \/ \E pkgs \in (SUBSET Packages \ {{}}) : BeginDisable(pkgs)
    \/ CompileDisable
    \/ Materialize
    \/ CompleteInstall
    \/ CrashDuringEnableCompile
    \/ CrashDuringDisableCompile
    \/ CrashDuringMaterialize

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* INVARIANTS *)

CompiledMatchesDirectInstalls ==
    (phase = "idle" /\ ~crashed) =>
        compiledState = Closure(directEnabled)

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
        directEnabled \subseteq compiledState

CrashLeavesRecordedStateSelfConsistent ==
    (phase = "idle" /\ crashed) =>
        directEnabled \subseteq compiledState

RecoveryRestoresConsistency ==
    phase = "done" =>
        /\ materializationState = compiledState
        /\ claudeLinks = compiledState
        /\ agentsLinks = compiledState

=============================================================================
