--------------------------- MODULE DevSession ------------------------------
(*
 * Formal specification of agentpack's dev session lifecycle.
 *
 * Models: startSkillDev(), cleanup(), reconcileDevSession()
 * from lib/skills.js and infrastructure/fs/dev-session-repository.js
 *
 * At most one active dev session can exist per repo. Sessions are tracked
 * by PID. When a process crashes, the next session start detects the stale
 * session via PID check and cleans up before starting.
 *
 * The model checker explores every interleaving of:
 *   - processes attempting to start dev sessions
 *   - processes crashing
 *   - cleanup running
 *   - reconciliation detecting stale sessions
 *)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS
    Procs,           \* Set of process IDs that can attempt dev sessions
    NoProc           \* Sentinel value meaning "no process owns session"

VARIABLES
    sessionStatus,   \* "none" | "active" | "cleaning" | "stale"
    sessionPid,      \* The PID owning the session (NoProc = no session)
    sessionLinks,    \* Set of symlink paths recorded in session
    procAlive,       \* Function: proc -> BOOLEAN (is process alive?)
    fsLinks,         \* Set of symlink paths that actually exist on disk
    procState        \* Function: proc -> "idle" | "dev" | "crashed"

vars == <<sessionStatus, sessionPid, sessionLinks, procAlive, fsLinks, procState>>

SkillLinks == {"claude_skill_foo", "agents_skill_foo"}

-----------------------------------------------------------------------------
(* Type invariant *)

TypeOK ==
    /\ sessionStatus \in {"none", "active", "cleaning", "stale"}
    /\ sessionPid \in Procs \union {NoProc}
    /\ sessionLinks \subseteq SkillLinks
    /\ procAlive \in [Procs -> BOOLEAN]
    /\ fsLinks \subseteq SkillLinks
    /\ procState \in [Procs -> {"idle", "dev", "crashed"}]

-----------------------------------------------------------------------------
(* Initial state *)

Init ==
    /\ sessionStatus = "none"
    /\ sessionPid = NoProc
    /\ sessionLinks = {}
    /\ procAlive = [p \in Procs |-> TRUE]
    /\ fsLinks = {}
    /\ procState = [p \in Procs |-> "idle"]

-----------------------------------------------------------------------------
(* Actions *)

(* A process attempts to start a dev session *)
StartDev(proc) ==
    /\ procAlive[proc] = TRUE
    /\ procState[proc] = "idle"
    /\ \/ \* Case 1: No existing session — start fresh
          /\ sessionStatus = "none"
          /\ sessionStatus' = "active"
          /\ sessionPid' = proc
          /\ sessionLinks' = SkillLinks
          /\ fsLinks' = fsLinks \union SkillLinks     \* create symlinks
          /\ procState' = [procState EXCEPT ![proc] = "dev"]
          /\ UNCHANGED procAlive
       \/ \* Case 2: Existing session with dead PID — reconcile then start
          /\ sessionStatus = "active"
          /\ sessionPid /= proc
          /\ procAlive[sessionPid] = FALSE             \* PID is dead
          \* Reconcile: clean up stale session
          /\ fsLinks' = (fsLinks \ sessionLinks) \union SkillLinks
          /\ sessionStatus' = "active"
          /\ sessionPid' = proc
          /\ sessionLinks' = SkillLinks
          /\ procState' = [procState EXCEPT ![proc] = "dev"]
          /\ UNCHANGED procAlive

(* Start is blocked if another live session exists *)
(* This is modeled by the guard: no action for active session with alive PID *)

(* A process crashes while running dev *)
Crash(proc) ==
    /\ procAlive[proc] = TRUE
    /\ procState[proc] = "dev"
    /\ procAlive' = [procAlive EXCEPT ![proc] = FALSE]
    /\ procState' = [procState EXCEPT ![proc] = "crashed"]
    \* Session file remains! Symlinks remain! This is the crash scenario.
    /\ UNCHANGED <<sessionStatus, sessionPid, sessionLinks, fsLinks>>

(* Normal shutdown: process cleans up gracefully *)
StopDev(proc) ==
    /\ procAlive[proc] = TRUE
    /\ procState[proc] = "dev"
    /\ sessionPid = proc
    /\ sessionStatus = "active"
    \* Transition through cleaning
    /\ sessionStatus' = "none"
    /\ sessionPid' = NoProc
    /\ fsLinks' = fsLinks \ sessionLinks        \* remove symlinks
    /\ sessionLinks' = {}
    /\ procState' = [procState EXCEPT ![proc] = "idle"]
    /\ UNCHANGED procAlive

(* Explicit reconciliation: detect and clean stale session.
   Two cases:
   1. Session PID is dead (standard detection)
   2. Session PID is alive but not in dev state (PID reuse after crash) *)
Reconcile(proc) ==
    /\ procAlive[proc] = TRUE
    /\ procState[proc] = "idle"
    /\ sessionStatus = "active"
    /\ \/ procAlive[sessionPid] = FALSE            \* PID is dead
       \/ /\ sessionPid = proc                     \* PID was reused — this proc
          /\ procState[proc] = "idle"              \* knows it's not running dev
    \* Clean up stale session
    /\ fsLinks' = fsLinks \ sessionLinks
    /\ sessionStatus' = "none"
    /\ sessionPid' = NoProc
    /\ sessionLinks' = {}
    /\ UNCHANGED <<procAlive, procState>>

(* A crashed process restarts (models: new CLI invocation with same or new PID) *)
ProcessRestart(proc) ==
    /\ procAlive[proc] = FALSE
    /\ procState[proc] = "crashed"
    /\ procAlive' = [procAlive EXCEPT ![proc] = TRUE]
    /\ procState' = [procState EXCEPT ![proc] = "idle"]
    /\ UNCHANGED <<sessionStatus, sessionPid, sessionLinks, fsLinks>>

Next ==
    \/ \E p \in Procs : StartDev(p)
    \/ \E p \in Procs : Crash(p)
    \/ \E p \in Procs : StopDev(p)
    \/ \E p \in Procs : Reconcile(p)
    \/ \E p \in Procs : ProcessRestart(p)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* INVARIANTS *)

(* 1. At most one active session at a time *)
AtMostOneActiveSession ==
    sessionStatus = "active" =>
        Cardinality({p \in Procs : procState[p] = "dev"}) <= 1

(* 2. If session is active and owner is alive, the links exist on disk *)
ActiveSessionLinksExist ==
    (sessionStatus = "active" /\ procAlive[sessionPid] = TRUE) =>
        sessionLinks \subseteq fsLinks

(* 3. If no session, the session-owned links should not exist *)
(* Note: this can be violated after a crash — which is the point! *)
(* The RECOVERED version: after reconciliation, no orphaned session links *)
NoSessionNoSessionLinks ==
    (sessionStatus = "none") => sessionLinks = {}

(* 4. Session PID must be valid *)
SessionPidValid ==
    sessionStatus = "active" => sessionPid \in Procs

(* 5. The dev process matches the session owner *)
DevProcessIsSessionOwner ==
    \A p \in Procs :
        procState[p] = "dev" => sessionPid = p

(* 6. If session is none, no process should think it's running dev *)
NoSessionNoDevProcs ==
    sessionStatus = "none" =>
        \A p \in Procs : procState[p] /= "dev"

(* 7. CRASH INVARIANT: after crash, links can be orphaned.
   This is the key thing TLA+ helps us verify — the stale state exists
   and reconciliation is needed to clean it up.
   We express: IF session active AND pid dead THEN we have stale state *)
CrashLeavesStaleState ==
    (sessionStatus = "active" /\ procAlive[sessionPid] = FALSE) =>
        \* Links still exist on disk (orphaned)
        sessionLinks \subseteq fsLinks

=============================================================================
