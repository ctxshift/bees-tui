// Browser-only design experiment. No Bees connection or writes.
(() => {
  const data = JSON.parse(document.getElementById('graph-data').textContent);
  const ordered = ['bees-40', 'bees-42', 'bees-43', 'bees-44', 'bees-48', 'bees-45', 'bees-47', 'bees-50', 'bees-46', 'bees-49'];
  const lane = {'bees-40': 0, 'bees-42': 1, 'bees-43': 1, 'bees-44': 2, 'bees-48': 3, 'bees-45': 3, 'bees-47': 1, 'bees-50': 0, 'bees-46': 0, 'bees-49': 0};
  const colors = ['#c1a0ef', '#e9b949', '#83d6ac', '#8fbdf3'];
  const byId = new Map(data.map(issue => [issue.id, issue]));
  const issues = ordered.map(id => byId.get(id));
  let selected = 'bees-42', mode = 'all';
  const rowHeight = 32, top = 16;
  const host = document.getElementById('git-rows');
  const svg = document.getElementById('git-rails');
  const detail = document.getElementById('git-detail');
  const escape = text => String(text).replace(/[&<>"']/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value]));
  const stateName = {open: 'Open', in_progress: 'In progress', deferred: 'Deferred', closed: 'Done'};
  const edges = issues.flatMap(issue => issue.dependencies.map(dep => ({from: dep.id, to: issue.id, type: dep.type})));
  const x = id => 18 + lane[id] * 24;
  const y = id => top + ordered.indexOf(id) * rowHeight;
  function edgePath(edge) {
    const a = x(edge.from), b = x(edge.to), start = y(edge.from), end = y(edge.to);
    if (a === b) return `M ${a} ${start} V ${end}`;
    const bend = b < a ? end - 16 : start + 16, direction = Math.sign(b - a), r = 6;
    return `M ${a} ${start} V ${bend-r} Q ${a} ${bend} ${a+direction*r} ${bend} H ${b-direction*r} Q ${b} ${bend} ${b} ${bend+r} V ${end}`;
  }
  function render() {
    const active = byId.get(selected);
    const neighborhood = new Set([selected, ...edges.filter(edge => edge.from === selected || edge.to === selected).flatMap(edge => [edge.from, edge.to])]);
    svg.setAttribute('viewBox', `0 0 100 ${issues.length * rowHeight}`);
    svg.innerHTML = edges.filter(edge => mode === 'all' || edge.type === mode).map(edge => {
      const focused = edge.from === selected || edge.to === selected;
      const color = edge.type === 'parent-child' ? colors[0] : edge.type === 'related' ? colors[3] : colors[lane[edge.from]];
      return `<path d="${edgePath(edge)}" fill="none" stroke="${color}" stroke-width="${focused ? 2.4 : 1.5}" stroke-opacity="${focused ? 1 : .4}" ${edge.type === 'blocks' ? '' : `stroke-dasharray="${edge.type === 'related' ? '2 5' : '5 4'}"`}/>`;
    }).join('') + issues.map(issue => {
      const focused = issue.id === selected, cx = x(issue.id), cy = y(issue.id), color = colors[lane[issue.id]];
      return `${focused ? `<circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="${color}" stroke-opacity=".35"/>` : ''}<circle cx="${cx}" cy="${cy}" r="${focused ? 5 : 4}" fill="${issue.status === 'closed' || focused ? color : '#171d28'}" stroke="${color}" stroke-width="2"/>`;
    }).join('');
    host.innerHTML = issues.map(issue => {
      const blockers = issue.dependencies.filter(dep => dep.type === 'blocks' && byId.get(dep.id)?.status !== 'closed');
      const status = blockers.length ? 'Blocked' : stateName[issue.status];
      const badge = issue.type === 'epic' ? 'EPIC' : issue.id === 'bees-47' ? 'MERGE · 2 blockers' : '';
      return `<button class="git-row ${issue.id === selected ? 'chosen' : ''} ${neighborhood.has(issue.id) ? 'connected' : ''}" data-issue="${issue.id}" aria-pressed="${issue.id === selected}" aria-label="${escape(issue.id + ' ' + issue.title)}"><span class="git-id">${issue.id}</span><span class="git-title">${escape(issue.title)} ${badge ? `<small class="git-badge">${badge}</small>` : ''}</span><span class="git-state ${blockers.length ? 'blocked' : issue.status}">${status}</span><span class="git-priority">P${issue.priority}</span></button>`;
    }).join('');
    const incoming = edges.filter(edge => edge.to === selected);
    const outgoing = edges.filter(edge => edge.from === selected);
    const relation = (edge, id, label) => `<button class="git-link" data-jump="${id}"><span class="relation-kind">${label}</span><span>${id} <span class="link-arrow">↗</span></span><strong>${escape(byId.get(id).title)}</strong></button>`;
    detail.innerHTML = `<div class="git-eyebrow">SELECTED ISSUE</div><div class="git-detail-id">${active.id} <span>${active.type.toUpperCase()}</span></div><h2>${escape(active.title)}</h2><p class="git-description">${escape(active.description)}</p><div class="git-tags">${active.labels.map(label => `<span>#${escape(label)}</span>`).join(' ')}</div><div class="git-section-title">CONNECTIONS <span>${incoming.length + outgoing.length}</span></div>${incoming.map(edge => relation(edge, edge.from, edge.type === 'blocks' ? 'BLOCKED BY' : edge.type === 'parent-child' ? 'PARENT' : 'RELATED')).join('')}${outgoing.map(edge => relation(edge, edge.to, edge.type === 'blocks' ? 'UNBLOCKS' : edge.type === 'parent-child' ? 'CHILD' : 'RELATED')).join('')}${!incoming.length && !outgoing.length ? '<p class="git-description">No connections. This issue can stand on its own.</p>' : ''}`;
    document.getElementById('git-position').textContent = `${ordered.indexOf(selected) + 1} / ${issues.length} issues`;
  }
  host.addEventListener('click', event => {const row = event.target.closest('[data-issue]'); if (row) {selected = row.dataset.issue; render(); host.focus({preventScroll: true});}});
  detail.addEventListener('click', event => {const link = event.target.closest('[data-jump]'); if (link) {selected = link.dataset.jump; render(); host.focus({preventScroll: true});}});
  document.querySelectorAll('[data-edge-mode]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.edgeMode;
    document.querySelectorAll('[data-edge-mode]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    render();
  }));
  document.getElementById('git-demo').addEventListener('keydown', event => {
    let delta = event.key === 'j' || event.key === 'ArrowDown' ? 1 : event.key === 'k' || event.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    event.preventDefault(); selected = ordered[Math.max(0, Math.min(ordered.length - 1, ordered.indexOf(selected) + delta))]; render();
  });
  render();
})();
