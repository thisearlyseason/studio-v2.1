'use client';

export function SaasTaxUseDeclaration({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-2 rounded-xl border bg-background p-4 text-sm">
      <span>How will this subscription be used?</span>
      <select aria-label="How will this subscription be used?" className="w-full rounded-md border bg-background p-2 text-foreground"
        required value={value} onChange={event => onChange(event.target.value)}>
        <option value="">Choose intended use</option>
        <option value="personal">Personal or recreational use</option>
        <option value="commercial">Commercial business use</option>
      </select>
      <span className="block text-xs text-muted-foreground">Choose how you will use The Squad. This does not claim a tax exemption. If neither option accurately fits, contact <a className="underline" href="mailto:team@thesquad.pro">team@thesquad.pro</a> before purchasing.</span>
    </label>
  );
}
