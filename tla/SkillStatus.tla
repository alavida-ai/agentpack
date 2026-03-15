--------------------------- MODULE SkillStatus ----------------------------
(* 
 * Formal specification of agentpack's compiler-driven skill status propagation.
 *
 * The compiled graph binds local source files to skills and compiled imports
 * connect skills to other skills. When a bound source changes, that skill
 * becomes stale. Skills that import a stale skill become affected.
 *
 * Status is only guaranteed to be correct immediately after recompute.
 *)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS
    Skills,          \* Set of compiled skill identities
    Sources,         \* Set of source file identities
    Dependencies,    \* Function: skill -> set of imported skills
    BoundSources     \* Function: skill -> set of bound sources

VARIABLES
    changedSources,  \* Set of changed source files
    status,          \* Function: skill -> "current" | "stale" | "affected"
    statusFresh      \* BOOLEAN - is the status map up to date?

vars == <<changedSources, status, statusFresh>>

-----------------------------------------------------------------------------
(* Type invariant *)

TypeOK ==
    /\ changedSources \subseteq Sources
    /\ status \in [Skills -> {"current", "stale", "affected"}]
    /\ statusFresh \in BOOLEAN
    /\ Dependencies \in [Skills -> SUBSET Skills]
    /\ BoundSources \in [Skills -> SUBSET Sources]

-----------------------------------------------------------------------------
(* Helper: transitive dependencies of a skill *)

RECURSIVE TransitiveDeps(_, _)
TransitiveDeps(skill, visited) ==
    LET directDeps == Dependencies[skill]
        newDeps == directDeps \ visited
    IN  newDeps \union
        UNION {TransitiveDeps(d, visited \union newDeps) : d \in newDeps}

SkillHasChangedSource(skill) ==
    BoundSources[skill] \intersect changedSources /= {}

CorrectStatus(skill) ==
    IF SkillHasChangedSource(skill)
    THEN "stale"
    ELSE IF \E dep \in TransitiveDeps(skill, {}) :
                SkillHasChangedSource(dep)
         THEN "affected"
         ELSE "current"

-----------------------------------------------------------------------------
(* Initial state *)

Init ==
    /\ changedSources = {}
    /\ status = [s \in Skills |-> "current"]
    /\ statusFresh = TRUE

-----------------------------------------------------------------------------
(* Actions *)

SourceChange(source) ==
    /\ source \in Sources
    /\ source \notin changedSources
    /\ changedSources' = changedSources \union {source}
    /\ statusFresh' = FALSE
    /\ UNCHANGED status

RecomputeStatus ==
    /\ status' = [s \in Skills |-> CorrectStatus(s)]
    /\ statusFresh' = TRUE
    /\ UNCHANGED changedSources

SourceRestore(source) ==
    /\ source \in changedSources
    /\ changedSources' = changedSources \ {source}
    /\ statusFresh' = FALSE
    /\ UNCHANGED status

Rebuild(skill) ==
    /\ skill \in Skills
    /\ BoundSources[skill] \intersect changedSources /= {}
    /\ changedSources' = changedSources \ BoundSources[skill]
    /\ statusFresh' = FALSE
    /\ UNCHANGED status

Next ==
    \/ \E src \in Sources : SourceChange(src)
    \/ \E src \in Sources : SourceRestore(src)
    \/ \E s \in Skills : Rebuild(s)
    \/ RecomputeStatus

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* INVARIANTS *)

StaleImpliesChanged ==
    statusFresh =>
        \A s \in Skills :
            status[s] = "stale" => SkillHasChangedSource(s)

AffectedImpliesTransitiveStaleDep ==
    statusFresh =>
        \A s \in Skills :
            status[s] = "affected" =>
                \E dep \in TransitiveDeps(s, {}) :
                    status[dep] \in {"stale", "affected"}

CurrentImpliesClean ==
    statusFresh =>
        \A s \in Skills :
            status[s] = "current" =>
                /\ ~SkillHasChangedSource(s)
                /\ \A dep \in TransitiveDeps(s, {}) :
                    ~SkillHasChangedSource(dep)

StatusMatchesCorrect ==
    statusFresh =>
        \A s \in Skills :
            status[s] = CorrectStatus(s)

NoChangesAllCurrent ==
    (statusFresh /\ changedSources = {}) =>
        \A s \in Skills : status[s] = "current"

=============================================================================
