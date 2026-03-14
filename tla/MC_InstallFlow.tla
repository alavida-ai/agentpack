---- MODULE MC_InstallFlow ----
EXTENDS InstallFlow

const_Packages == {"X", "Y"}

const_PackageDeps ==
    [p \in const_Packages |->
        CASE p = "X" -> {}
          [] p = "Y" -> {"X"}
    ]

====
