import Image from 'next/image';

/** Parent brand attribution; The Squad remains the product identity. */
export function ParentCompanyBrand() {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="text-[10px] font-semibold text-muted-foreground">A Gameday Sports app</span>
      <div className="rounded-md bg-white px-3 py-1">
        <Image src="/gameday-sports-light.png" alt="Gameday Sports" width={1774} height={887} unoptimized className="h-auto w-32 object-contain" />
      </div>
    </div>
  );
}
