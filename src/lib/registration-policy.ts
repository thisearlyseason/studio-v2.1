import {createHash} from 'node:crypto';

export class RegistrationInputError extends Error {
  readonly status:number;
  constructor(message:string, status=400) {super(message);this.status=status;}
}

const TYPES = new Set(['short_text','long_text','email','phone','date','number','select','dropdown','radio','multi_select','checkbox','signature','header','information_box']);
const OPTION_TYPES = new Set(['select','dropdown','radio','multi_select']);
const text = (value:unknown, max:number, label:string, required=false) => {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new RegistrationInputError(`Invalid ${label}.`);
  return value.trim();
};
const canonical = (value:unknown):unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])) : value;

export function registrationConfigHash(config:Record<string,unknown>) {
  const {config_hash:_,...value}=config;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export function validateRegistrationConfig(raw:unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RegistrationInputError('A registration configuration is required.');
  const input=raw as Record<string,any>;
  const allowed=new Set(['title','description','is_active','type','form_schema','waiver_mode','selected_team_waivers','team_waivers_content','default_waiver_text','require_default_waiver','custom_waiver_text','confirmation_message','form_version','registration_cost','offline_payment_instructions','currency','require_division_selection','available_divisions']);
  if(Object.keys(input).some(key=>!allowed.has(key)))throw new RegistrationInputError('Unsupported registration configuration field.');
  if(!['player','team','waiver'].includes(input.type))throw new RegistrationInputError('Invalid registration type.');
  if(typeof input.is_active!=='boolean')throw new RegistrationInputError('Registration active state is required.');
  const schema=Array.isArray(input.form_schema)?input.form_schema:[];
  if(schema.length>50)throw new RegistrationInputError('Registration forms support at most 50 fields.');
  const ids=new Set<string>();
  const form_schema=schema.map((item:any,index:number)=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new RegistrationInputError(`Invalid field ${index+1}.`);
    if(Object.keys(item).some(key=>!['id','label','type','required','options','step','placeholder','infoContent'].includes(key)))throw new RegistrationInputError('Unsupported registration field setting.');
    const id=text(item.id,100,'field id',true);if(!/^[A-Za-z0-9_-]+$/.test(id))throw new RegistrationInputError('Invalid field id.');
    if(ids.has(id))throw new RegistrationInputError('Duplicate registration field id.');ids.add(id);
    const type=text(item.type,40,'field type',true);if(!TYPES.has(type))throw new RegistrationInputError('Unsupported registration field type.');
    const options=Array.isArray(item.options)?item.options.map((value:unknown)=>text(value,200,'field option',true)):[];
    if(OPTION_TYPES.has(type)&&options.length===0)throw new RegistrationInputError('Registration choice fields require options.');
    if(options.length>50||new Set(options.map((value:string)=>value.toLowerCase())).size!==options.length)throw new RegistrationInputError('Invalid or duplicate registration field options.');
    const step=typeof item.step==='string'&&['identity','contact','medical','guardian','team_code','additional','compliance'].includes(item.step)?item.step:undefined;
    return {id,label:text(item.label,type==='information_box'?2000:200,'field label',true),type,required:item.required===true,...(options.length?{options}:{}),...(step?{step}:{}),...(item.placeholder?{placeholder:text(item.placeholder,300,'placeholder')}:{}),...(item.infoContent?{infoContent:text(item.infoContent,2000,'information')}: {})};
  });
  const form_version=Number(input.form_version);if(!Number.isInteger(form_version)||form_version<1)throw new RegistrationInputError('A positive form version is required.');
  const result:Record<string,unknown>={title:text(input.title,200,'title',true),description:text(input.description,2000,'description'),is_active:input.is_active,type:input.type,form_schema,form_version,
    waiver_mode:['none','universal','team','mixed'].includes(input.waiver_mode)?input.waiver_mode:'none',require_default_waiver:input.require_default_waiver===true,
    default_waiver_text:text(input.default_waiver_text,50000,'default waiver'),custom_waiver_text:text(input.custom_waiver_text,50000,'custom waiver'),confirmation_message:text(input.confirmation_message,1000,'confirmation'),
    registration_cost:text(input.registration_cost,20,'registration cost'),offline_payment_instructions:text(input.offline_payment_instructions,2000,'offline payment instructions'),currency:text(input.currency||'CAD',3,'currency',true).toUpperCase(),
    require_division_selection:input.require_division_selection===true,available_divisions:Array.isArray(input.available_divisions)?input.available_divisions.slice(0,100).map((value:unknown)=>text(value,100,'division',true)):[],
    selected_team_waivers:Array.isArray(input.selected_team_waivers)?input.selected_team_waivers.slice(0,100).map((value:unknown)=>text(value,200,'waiver id',true)):[],
    team_waivers_content:Array.isArray(input.team_waivers_content)?input.team_waivers_content.slice(0,20).map((waiver:any)=>({id:text(waiver?.id,200,'waiver id',true),title:text(waiver?.title,200,'waiver title',true),content:text(waiver?.content,50000,'waiver content',true)})):[]};
  result.config_hash=registrationConfigHash(result);return result;
}

export function registrationPaymentSnapshot(config:Record<string,unknown>) {
  const raw=String(config.registration_cost??'0').trim();const amount=raw===''?0:Number(raw);
  if(!Number.isFinite(amount)||amount<0||amount>1_000_000)throw new RegistrationInputError('Invalid registration fee.');
  const currency=String(config.currency||'CAD').trim().toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new RegistrationInputError('Invalid registration currency.');
  if(amount===0)return {amount:0,currency,mode:'free' as const,status:'not_required' as const,instructions:null};
  const instructions=text(config.offline_payment_instructions,2000,'offline payment instructions',true);
  return {amount,currency,mode:'offline' as const,status:'pending' as const,instructions};
}
