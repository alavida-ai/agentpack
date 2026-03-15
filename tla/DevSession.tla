--------------------------- MODULE DevSession ------------------------------
(* 
 * Formal specification of agentpack's dev session lifecycle.
 *
 * Models the compiler-driven dev workflow:
 *   - compile a local graph slice
 *   - materialize adapter outputs owned by the dev session
 *   - clean those outputs up on stop or reconciliation
 *
 * There is no legacy discovery path in this model.
 *)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS
    Procs,           \* Set of process IDs that can attempt dev sessions
    NoProc           \* Sentinel value meaning "no process owns session"

VARIABLES
    sessionStatus,    \* "none" | "active"
    sessionPid,       \* The PID owning the session
    sessionOutputs,   \* Adapter outputs recorded as owned by the session
    sessionCompiled,  \* Has the dev graph slice been compiled and recorded?
    procAlive,        \* Function: proc -> BOOLEAN
    fsOutputs,        \* Outputs that actually exist on disk
    procState         \* Function: proc -> "idle" | "dev" | "crashed"

vars == <<sessionStatus, sessionPid, sessionOutputs, sessionCompiled,
          procAlive, fsOutputs, procState>>

DevOutputs == {"claude_skill_foo", "agents_skill_foo"}

-----------------------------------------------------------------------------
(* Type invariant *)

TypeOK ==
    /\ sessionStatus \in {"none", "active"}
    /\ sessionPid \in Procs \union {NoProc}
    /\ sessionOutputs \subseteq DevOutputs
    /\ sessionCompiled \in BOOLEAN
    /\ procAlive \in [Procs -> BOOLEAN]
    /\ fsOutputs \subseteq DevOutputs
    /\ procState \in [Procs -> {"idle", "dev", "crashed"}]

-----------------------------------------------------------------------------
(* Initial state *)

Init ==
    /\ sessionStatus = "none"
    /\ sessionPid = NoProc
    /\ sessionOutputs = {}
    /\ sessionCompiled = FALSE
    /\ procAlive = [p \in Procs |-> TRUE]
    /\ fsOutputs = {}
    /\ procState = [p \in Procs |-> "idle"]

-----------------------------------------------------------------------------
(* Actions *)

StartDev(proc) ==
    /\ procAlive[proc] = TRUE
    /\ procState[proc] = "idle"
    /\ \/
          /\ sessionStatus = "none"
          /\ sessionStatus' = "active"
          /\ sessionPid' = proc
          /\ sessionOutputs' = DevOutputs
          /\ sessionCompiled' = TRUE
          /\ fsOutputs' = fsOutputs \union DevOutputs
          /\ procState' = [procState EXCEPT ![proc] = "dev"]
          /\ UNCHANGED procAlive
       \/
          /\ sessionStatus = "active"
          /\ sessionPid /= proc
          /\ procAlive[sessionPid] = FALSE
          /\ sessionStatus' = "active"
          /\ sessionPid' = proc
          /\ sessionOutputs' = DevOutputs
          /\ sessionCompiled' = TRUE
          /\ fsOutputs' = (fsOutputs \ sessionOutputs) \union DevOutputs
          /\ procState' = [procState EXCEPT ![proc] = "dev"]
          /\ UNCHANGED procAlive

Crash(proc) ==
    /\ procAlive[proc] = TRUE
    /\ procState[proc] = "dev"
    /\ procAlive' = [procAlive EXCEPT ![proc] = FALSE]
    /\ procState' = [procState EXCEPT ![proc] = "crashed"]
    /\ UNCHANGED <<sessionStatus, sessionPid, sessionOutputs, sessionCompiled, fsOutputs>>

StopDev(proc) ==
    /\ procAlive[proc] = TRUE
    /\ procState[proc] = "dev"
    /\ sessionStatus = "active"
    /\ sessionPid = proc
    /\ sessionStatus' = "none"
    /\ sessionPid' = NoProc
    /\ sessionOutputs' = {}
    /\ sessionCompiled' = FALSE
    /\ fsOutputs' = fsOutputs \ sessionOutputs
    /\ procState' = [procState EXCEPT ![proc] = "idle"]
    /\ UNCHANGED procAlive

Reconcile(proc) ==
    /\ procAlive[proc] = TRUE
    /\ procState[proc] = "idle"
    /\ sessionStatus = "active"
    /\ \/ procAlive[sessionPid] = FALSE
       \/ /\ sessionPid = proc
          /\ procState[proc] = "idle"
    /\ sessionStatus' = "none"
    /\ sessionPid' = NoProc
    /\ sessionOutputs' = {}
    /\ sessionCompiled' = FALSE
    /\ fsOutputs' = fsOutputs \ sessionOutputs
    /\ UNCHANGED <<procAlive, procState>>

ProcessRestart(proc) ==
    /\ procAlive[proc] = FALSE
    /\ procState[proc] = "crashed"
    /\ procAlive' = [procAlive EXCEPT ![proc] = TRUE]
    /\ procState' = [procState EXCEPT ![proc] = "idle"]
    /\ UNCHANGED <<sessionStatus, sessionPid, sessionOutputs, sessionCompiled, fsOutputs>>

Next ==
    \/ \E p \in Procs : StartDev(p)
    \/ \E p \in Procs : Crash(p)
    \/ \E p \in Procs : StopDev(p)
    \/ \E p \in Procs : Reconcile(p)
    \/ \E p \in Procs : ProcessRestart(p)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* INVARIANTS *)

AtMostOneActiveSession ==
    sessionStatus = "active" =>
        Cardinality({p \in Procs : procState[p] = "dev"}) <= 1

ActiveSessionOutputsExist ==
    (sessionStatus = "active" /\ procAlive[sessionPid] = TRUE) =>
        sessionOutputs \subseteq fsOutputs

ActiveSessionHasCompiledSlice ==
    sessionStatus = "active" =>
        sessionCompiled = TRUE

NoSessionClearsOwnedState ==
    sessionStatus = "none" =>
        /\ sessionOutputs = {}
        /\ sessionCompiled = FALSE

SessionPidValid ==
    sessionStatus = "active" => sessionPid \in Procs

DevProcessIsSessionOwner ==
    \A p \in Procs :
        procState[p] = "dev" => sessionPid = p

NoSessionNoDevProcs ==
    sessionStatus = "none" =>
        \A p \in Procs : procState[p] /= "dev"

CrashLeavesOwnedOutputs ==
    (sessionStatus = "active" /\ procAlive[sessionPid] = FALSE) =>
        /\ sessionCompiled = TRUE
        /\ sessionOutputs \subseteq fsOutputs

=============================================================================
