export function validateRsvpRoleObservations(observations, {actor,calendar,staff,participants}) {
  const required=(calendar?['events','calendar']:['events']).flatMap(route=>['1440x900','390x844'].map(size=>`${route}:${size}`)).sort();
  const actual=observations.map(item=>`${item.route}:${item.viewport.width}x${item.viewport.height}`).sort();
  if(JSON.stringify(actual)!==JSON.stringify(required)) throw new Error(`RSVP ${actor} missing exact route/viewport evidence.`);
  for(const item of observations) {
    if(item.actor!==actor || JSON.stringify(item.participants)!==JSON.stringify(participants)) throw new Error(`RSVP ${actor} participant persistence mismatch.`);
    const names=['dialog','close',...participants.map((_item,index)=>`participant-${index}`),...(staff?['matrix']:['going','maybe','decline'])];
    for(const name of names) {
      const box=item.controls[name],{width,height}=item.viewport;
      if(!box || ![box.x,box.y,box.width,box.height].every(Number.isFinite) || box.width<=0 || box.height<=0 || box.x < -0.5 || box.y < -0.5 || box.x+box.width>width+0.5 || box.y+box.height>height+0.5) throw new Error(`RSVP ${actor} ${item.route} ${width}x${height} ${name} bounds: ${JSON.stringify(box)}`);
    }
  }
  return true;
}
