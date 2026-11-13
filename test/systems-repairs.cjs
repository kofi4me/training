module.exports = {
  linux: {
    'account-provisioning': { group:'support', operator:'ana', analyst:'devon', addOperator:true, addAnalyst:true, ownerGroup:'team', mode:'2770', fresh:true },
    'linux-permissions': { file:'0640' },
    'linux-service': { configReadable:true, port:'8081', clientPort:'8081', enabled:true },
    'linux-installation': { disk:'system', boot:'disk', network:'lab', source:'reports', log:'server' },
    'linux-package-service': { refresh:true, package:'nginx', pid:'owned', start:true, enable:true, probe:'80' },
    'linux-backup-restore': { label:'KRYPTLABDATA', source:'company', archive:'verified', verify:true, target:'staging', compare:true },
    'linux-health-repair': { measure:'disk', cleanup:'archive', restart:true, probes:'both' },
    'linux-server-handover': { fault:'socket', baseline:'health', team:'2770', evidence:'sockets', repair:'port', service:'enable', restore:'compare', report:'complete', rollback:'site' }
  },
  automation: {
    'automation-log-audit': { threshold:'2', skip:true, nonzero:true },
    'automation-inventory': { requirePreflight:true, strategy:'reconcile', apply:true },
    'automation-scheduled-job': { lock:true, atomic:true, propagate:true }
  },
  recovery: {
    'recovery-budget': { interval:'15', copy:'15' },
    'recovery-chain': { cleanCopy:true },
    'recovery-capstone': { isolate:true, source:'offline', automation:'reconcile', serviceAccess:true, serviceEnabled:true, probe:true, cutover:true }
  }
};
