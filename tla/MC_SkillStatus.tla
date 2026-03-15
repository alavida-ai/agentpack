---- MODULE MC_SkillStatus ----
EXTENDS SkillStatus

const_Skills == {"A", "B", "C"}

const_Sources == {"s1", "s2", "s3"}

const_Dependencies ==
    [s \in const_Skills |->
        CASE s = "A" -> {}
          [] s = "B" -> {"A"}
          [] s = "C" -> {"B"}
    ]

const_BoundSources ==
    [s \in const_Skills |->
        CASE s = "A" -> {"s1"}
          [] s = "B" -> {"s2"}
          [] s = "C" -> {"s3"}
    ]

====
