import { discoveryMetadata } from '@/lib/discovery-metadata';
export const metadata = discoveryMetadata('/how-to', 'Help and Operational Guide', 'Step-by-step screenshot guides for coaches, parents, athletes, school and club leaders, competition organizers, officials and spectators.');
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}<aside className="border-t p-6 text-center">Product support: <a className="underline" href="mailto:team@thesquad.pro">team@thesquad.pro</a></aside></>; }
