export function validatePollInput(value: unknown) {
  const poll = value && typeof value === 'object' ? value as Record<string,unknown> : {};
  const question = typeof poll.question === 'string' ? poll.question.trim() : '';
  if (!question || question.length > 500 || !Array.isArray(poll.options) || poll.options.length < 2 || poll.options.length > 10) {
    throw Error('A poll needs a question up to 500 characters and 2–10 options.');
  }
  const texts = new Set<string>();
  const options = poll.options.map(raw=>{
    const option = raw && typeof raw === 'object' ? raw as Record<string,unknown> : {};
    const text = typeof option.text === 'string' ? option.text.trim() : '';
    if (!text || text.length > 240 || texts.has(text.toLowerCase())) throw Error('Poll options must be distinct, nonblank, and at most 240 characters.');
    texts.add(text.toLowerCase());
    return {text,image:typeof option.image === 'string' ? option.image.slice(0,500_000) : null};
  });
  return {question,options};
}

type PollOption = {id?: string; text?: string; votes?: number; isDeleted?: boolean; [key:string]:unknown};
type Poll = {options:PollOption[]; voters?:Record<string,string|number>; totalVotes?:number; isClosed?:boolean; isDeleted?:boolean; [key:string]:unknown};

/** Normalize legacy indices to stable IDs where available, then derive—not increment—totals. */
export function applyPollVote(poll: Poll, uid: string, selection: string | number): Poll {
  if (!poll || poll.isClosed || poll.isDeleted || !Array.isArray(poll.options)) throw Error('INVALID_POLL');
  const options = poll.options;
  const index = typeof selection === 'string' ? options.findIndex(option=>option.id === selection) : selection;
  if (!Number.isInteger(index) || index < 0 || index >= options.length || options[index].isDeleted) throw Error('INVALID_POLL');
  const keyFor = (index:number) => options[index].id || index;
  const canonical = Object.entries(poll.voters || {}).flatMap(([actor,value])=>{
    const previous = typeof value === 'string' ? options.findIndex(option=>option.id === value) : value;
    return Number.isInteger(previous) && previous >= 0 && previous < options.length && !options[previous].isDeleted ? [[actor,keyFor(previous)]] : [];
  });
  const voters = Object.fromEntries([...canonical,[uid,keyFor(index)]]) as Record<string,string|number>;
  const votes = Object.values(voters);
  return {...poll,voters,totalVotes:votes.length,options:options.map((option,index)=>({...option,votes:votes.filter(value=>value === keyFor(index)).length}))};
}
