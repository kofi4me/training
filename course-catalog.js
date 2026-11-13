export const courseLabels = Object.freeze({
  network: 'Network Fundamentals (legacy assessment)',
  devices: 'Network Fundamentals',
  communications: 'Network Communication',
  addressing: 'IP Addressing',
  vlans: 'VLANs',
  routing: 'Routing',
  switching: 'Switching and MAC Address Learning',
  dhcp: 'DHCP Operations',
  dns: 'DNS Operations',
  firewall: 'Network Firewalls and ACLs',
  nat: 'NAT/PAT',
  monitoring: 'Network Monitoring and Troubleshooting',
  mitm: 'MiTM Investigation',
  ddos: 'DoS / DDoS Investigation',
  linux: 'Linux Server Administration',
  automation: 'Automation and Scripting',
  recovery: 'Backup, Restore & Recovery'
});

const systemsCourses = ['linux', 'automation', 'recovery'];

export function courseForLocation(pathname, search, hash = '') {
  const params = new URLSearchParams(search);
  if (pathname.endsWith('/fundamentals.html')) {
    const id = params.get('course') || hash.replace(/^#/, '') || 'devices';
    return Object.hasOwn(courseLabels, id) && !['network', 'mitm', 'ddos', ...systemsCourses].includes(id) ? id : null;
  }
  if (pathname.endsWith('/security.html')) {
    const id = params.get('lab') || 'mitm';
    return ['mitm', 'ddos'].includes(id) ? id : null;
  }
  if (pathname.endsWith('/systems.html')) {
    const id = params.get('course') || 'linux';
    return systemsCourses.includes(id) ? id : null;
  }
  return pathname.endsWith('/index.html') ? 'network' : null;
}
