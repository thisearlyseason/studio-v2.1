"use client";

import type { SchoolOrganizationDeclaration } from '@/lib/school-plan-eligibility';

export function SchoolPlanDeclaration({ value, onChange }: {
  value: SchoolOrganizationDeclaration | '';
  onChange: (value: SchoolOrganizationDeclaration | '') => void;
}) {
  return (
    <label className="block space-y-2 text-sm" onClick={event => event.stopPropagation()}>
      <span>I confirm that my organization is a:</span>
      <select aria-label="Schools plan organization declaration" className="w-full rounded-md border bg-background p-2 text-foreground"
        value={value} onChange={event => onChange(event.target.value as SchoolOrganizationDeclaration | '')}>
        <option value="">Choose School or Nonprofit</option>
        <option value="school">School</option>
        <option value="nonprofit">Nonprofit</option>
      </select>
      <span className="block text-xs text-muted-foreground">Other organizations can use Elite Teams or Elite League. This declaration does not establish tax exemption.</span>
    </label>
  );
}
