--------------------------- MODULE SkillStatus ----------------------------
(*
 * Formal specification of agentpack's skill status propagation.
 *
 * Models: buildSkillStatusMap() from domain/skills/skill-graph.js
 *
 * Skills form a dependency graph. Each skill has sources that can change.
 * When a source changes, the skill becomes "stale". Skills that depend
 * (transitively) on a stale skill become "affected". The model checker
 * explores every combination of source changes and verifies the status
 * propagation invariants hold.
 *
 * KEY DESIGN INSIGHT: Status is only accurate immediately after recompute.
 * Between recomputes, sources can change on disk and the status map becomes
 * stale. This is by design — agentpack only recomputes on explicit command.
 *)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS
    Skills,          \* Set of skill package names
    Dependencies     \* Function: skill -> set of skills it depends on

VARIABLES
    sourceChanged,   \* Function: skill -> BOOLEAN (has source file changed?)
    status,          \* Function: skill -> "current" | "stale" | "affected"
    statusFresh      \* BOOLEAN — is the status map up to date?

vars == <<sourceChanged, status, statusFresh>>

-----------------------------------------------------------------------------
(* Type invariant *)

TypeOK ==
    /\ sourceChanged \in [Skills -> BOOLEAN]
    /\ status \in [Skills -> {"current", "stale", "affected"}]
    /\ statusFresh \in BOOLEAN

-----------------------------------------------------------------------------
(* Helper: transitive dependencies of a skill *)

RECURSIVE TransitiveDeps(_, _)
TransitiveDeps(skill, visited) ==
    LET directDeps == Dependencies[skill]
        newDeps == directDeps \ visited
    IN  newDeps \union
        UNION {TransitiveDeps(d, visited \union newDeps) : d \in newDeps}

(* Compute what status a skill SHOULD have based on current sourceChanged *)
CorrectStatus(skill) ==
    IF sourceChanged[skill]
    THEN "stale"
    ELSE IF \E dep \in TransitiveDeps(skill, {}) :
                sourceChanged[dep]
         THEN "affected"
         ELSE "current"

-----------------------------------------------------------------------------
(* Initial state *)

Init ==
    /\ sourceChanged = [s \in Skills |-> FALSE]
    /\ status = [s \in Skills |-> "current"]
    /\ statusFresh = TRUE

-----------------------------------------------------------------------------
(* Actions *)

(* A source file changes for some skill *)
SourceChange(skill) ==
    /\ sourceChanged[skill] = FALSE
    /\ sourceChanged' = [sourceChanged EXCEPT ![skill] = TRUE]
    /\ statusFresh' = FALSE    \* status is now potentially stale
    /\ UNCHANGED status

(* The system recomputes status (e.g. `agentpack skills status`) *)
RecomputeStatus ==
    /\ status' = [s \in Skills |-> CorrectStatus(s)]
    /\ statusFresh' = TRUE
    /\ UNCHANGED sourceChanged

(* A source is restored (e.g. git checkout reverts a file) *)
SourceRestore(skill) ==
    /\ sourceChanged[skill] = TRUE
    /\ sourceChanged' = [sourceChanged EXCEPT ![skill] = FALSE]
    /\ statusFresh' = FALSE
    /\ UNCHANGED status

(* A validate/rebuild clears staleness (updates build-state hashes) *)
Rebuild(skill) ==
    /\ sourceChanged[skill] = TRUE
    /\ sourceChanged' = [sourceChanged EXCEPT ![skill] = FALSE]
    /\ statusFresh' = FALSE
    /\ UNCHANGED status

Next ==
    \/ \E s \in Skills : SourceChange(s)
    \/ \E s \in Skills : SourceRestore(s)
    \/ \E s \in Skills : Rebuild(s)
    \/ RecomputeStatus

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* INVARIANTS *)

(* 1. When status is fresh, stale status implies changed sources *)
StaleImpliesChanged ==
    statusFresh =>
        \A s \in Skills :
            status[s] = "stale" => sourceChanged[s] = TRUE

(* 2. When fresh, affected implies a transitive dep is stale or affected *)
AffectedImpliesTransitiveStaleDep ==
    statusFresh =>
        \A s \in Skills :
            status[s] = "affected" =>
                \E dep \in TransitiveDeps(s, {}) :
                    status[dep] \in {"stale", "affected"}

(* 3. When fresh, current means clean everywhere *)
CurrentImpliesClean ==
    statusFresh =>
        \A s \in Skills :
            status[s] = "current" =>
                /\ sourceChanged[s] = FALSE
                /\ \A dep \in TransitiveDeps(s, {}) :
                    sourceChanged[dep] = FALSE

(* 4. When fresh, status exactly matches CorrectStatus *)
StatusMatchesCorrect ==
    statusFresh =>
        \A s \in Skills :
            status[s] = CorrectStatus(s)

(* 5. If nothing changed, recompute produces all current *)
NoChangesAllCurrent ==
    (statusFresh /\ \A s \in Skills : sourceChanged[s] = FALSE) =>
        \A s \in Skills : status[s] = "current"

(* 6. DESIGN GAP DETECTOR: status can be wrong when not fresh.
   This is NOT an invariant — it's expected to be violated.
   Uncomment to see the counterexample trace showing stale status. *)
\* StatusAlwaysCorrect ==
\*     \A s \in Skills : status[s] = CorrectStatus(s)

=============================================================================
