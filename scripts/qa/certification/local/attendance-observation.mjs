export function validateAttendanceLedger(download, { eventId, memberName, status, teamMarker, forbiddenMarkers, maxRows, expectedRows }) {
  const { filename, content, byteLength } = download;
  if (filename !== `attendance_${eventId}.csv` || !Number.isInteger(byteLength) || byteLength <= 0 || byteLength > 65536 || content.length > 65536) throw new Error('Attendance download filename/size mismatch.');
  const [header, ...rows] = content.trimEnd().split(/\r?\n/);
  if (header !== 'Name,Status' || rows.length < 1 || rows.length > maxRows) throw new Error(`Attendance CSV header/row bound mismatch: ${JSON.stringify({ header:header.slice(0,80), rows:rows.length, byteLength })}`);
  if (!Array.isArray(expectedRows) || JSON.stringify([...rows].sort()) !== JSON.stringify([...expectedRows].sort())) throw new Error('Attendance CSV differs from the exact authoritative Team A roster/status row multiset.');
  if (!rows.every(row => /^[^,\r\n]+,(going|maybe|declined|no_response)$/.test(row))) throw new Error('Attendance CSV contains unexpected columns or status.');
  if (rows.filter(row => row === `${memberName},${status}`).length !== 1 || !content.includes(teamMarker) || forbiddenMarkers.some(marker => marker && content.includes(marker))) throw new Error('Attendance CSV member/tenant/private-data reconciliation failed.');
  return { filename, byteLength, rows: rows.length, content };
}

export function validateAttendanceBounds(measurements, { staff = true, rsvp = false } = {}) {
  if (measurements.length !== 2 || measurements.map(item => `${item.viewport.width}x${item.viewport.height}`).join(',') !== '1440x900,390x844') throw new Error('Attendance requires exact desktop and mobile measurements.');
  for (const { viewport, controls } of measurements) {
    for (const name of ['dialog', 'matrix', 'tab', 'close', ...(staff ? ['export'] : []), ...(rsvp ? ['going', 'maybe', 'decline'] : [])]) {
      const box = controls[name];
      if (!box || ![box.x,box.y,box.width,box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0 || box.x < -1 || box.y < -1 || box.x+box.width > viewport.width+1 || box.y+box.height > viewport.height+1) throw new Error(`Attendance ${name} exceeds ${viewport.width}x${viewport.height}: ${JSON.stringify(box)}`);
    }
  }
  return true;
}
