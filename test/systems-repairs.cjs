module.exports = {
  linux: {
    'account-provisioning': { group:'support', operator:'ana', analyst:'devon', addOperator:true, addAnalyst:true, ownerGroup:'team', mode:'2770', fresh:true },
    'linux-permissions': { file:'0640' },
    'linux-service': { configReadable:true, port:'8081', clientPort:'8081', enabled:true }
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
