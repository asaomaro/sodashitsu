# Validation

Node24.22.2.108selectedtests passed: numericadapter16, hookscript/socket/installer plus PIDregression, productionagent.usage fixture. Old4productionfiles (before feature, afterseparatePIDfix) yield4failures/103passes across107tests. Exactfourfile restoration is in restoration.json;108selectedrepass rawoutput in restored.txt. No fullrepository suite duplicated.

Productionfixture proves acceptedscopednumericreport→realhookasset→reportSocket→existingintake→registeredadapter→agent.usage, no initialzero, samegeneration dedup, secondgenerationadd, no childdata/text/context. It uses ownfakeCLI/temporaryserver, not an actual modelturn or productionpane. MissingPID behavior was initially observed as best-effort before separatePIDfix; finalfixture contains currentPIDfix and ordinaryscopeguards. Realinstallednumericcallback emission and Windowsactualruntime remain unverified. Final servertsc-b exit0 and complete servertest-source typecheck exit0. Root independentreview requested.
