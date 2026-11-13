export function initialSwitch() {
  return { time: 0, aging: 30, table: [], ports: ['A','B','C','D'].map((name,i)=>({ name, port:i+1, mac:'02:00:00:00:00:0'+(i+1), vlan:i===3?20:10, up:true })) };
}
export function ageSwitch(state, seconds) {
  if (!Number.isInteger(seconds) || seconds<0 || seconds>3600) throw Error('Use 0–3600 simulated seconds.');
  const time=state.time+seconds;
  return {...state,time,table:state.table.filter(row=>time-row.seen<state.aging)};
}
export function configurePort(state, port, patch) {
  if (!state.ports.some(p=>p.port===port)) throw Error('Unknown port.');
  if (Object.keys(patch).some(k=>!['vlan','up'].includes(k))) throw Error('Invalid port setting.');
  if ('vlan' in patch && (!Number.isInteger(patch.vlan)||patch.vlan<1||patch.vlan>4094)) throw Error('Invalid VLAN.');
  if ('up' in patch && typeof patch.up!=='boolean') throw Error('Invalid link state.');
  return {...state,ports:state.ports.map(p=>p.port===port?{...p,...patch}:p),table:state.table.filter(row=>row.port!==port)};
}
export function transmit(state, sourceName, targetName) {
  const source=state.ports.find(p=>p.name===sourceName), target=state.ports.find(p=>p.name===targetName);
  if (!source || (!target && targetName!=='broadcast')) throw Error('Choose valid endpoints.');
  const next=ageSwitch(state,1);
  if(!source.up) return {state:next,decision:'drop',egress:[],accepted:[],source,steps:['PC '+source.name+' has no operational access link. The switch receives no frame.']};
  const mac=targetName==='broadcast'?'ff:ff:ff:ff:ff:ff':target.mac;
  next.table=next.table.filter(row=>!(row.vlan===source.vlan&&row.mac===source.mac));
  next.table.push({vlan:source.vlan,mac:source.mac,port:source.port,seen:next.time});
  const learned=next.table.find(row=>row.vlan===source.vlan&&row.mac===mac);
  const eligible=next.ports.filter(p=>p.up&&p.vlan===source.vlan&&p.port!==source.port);
  const decision=targetName==='broadcast'?'broadcast':learned?'known':'unknown';
  const egress=learned?eligible.filter(p=>p.port===learned.port):eligible;
  const accepted=egress.filter(p=>targetName==='broadcast'||p.mac===mac).map(p=>p.name);
  return {state:next,source,target:mac,decision,egress:egress.map(p=>p.name),accepted,steps:[
    'PC '+source.name+' sends a frame on port '+source.port+' in access VLAN '+source.vlan+'. Source '+source.mac+'; destination '+mac+'.',
    'Learn or refresh the SOURCE MAC '+source.mac+' on port '+source.port+' in VLAN '+source.vlan+'. The destination is not learned by receiving this frame.',
    decision==='known'?'Destination lookup finds port '+learned.port+' in VLAN '+source.vlan+'.':
      decision==='broadcast'?'Broadcast destination: replicate to operational ports in the same VLAN, excluding ingress.':'Unknown destination in this VLAN: flood operational same-VLAN ports, excluding ingress.',
    'Egress copies: '+(egress.map(p=>'PC '+p.name).join(', ')||'none')+'. Intended receiver acceptance: '+(accepted.join(', ')||'none')+'. Unrelated unicast receivers discard their copies.'
  ]};
}
