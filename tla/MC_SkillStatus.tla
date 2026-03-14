---- MODULE MC_SkillStatus ----
EXTENDS SkillStatus

const_Skills == {"A", "B", "C"}

const_Dependencies ==
    [s \in const_Skills |->
        CASE s = "A" -> {}
          [] s = "B" -> {"A"}
          [] s = "C" -> {"B"}
    ]

====
