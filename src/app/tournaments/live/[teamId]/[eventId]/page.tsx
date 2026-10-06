'use client';
import {useParams}from'next/navigation';
import CompetitionController from '@/components/tournaments/CompetitionController';
export default function Page(){const{teamId,eventId}=useParams<{teamId:string;eventId:string}>();return <main className="min-h-screen bg-background md:p-6"><CompetitionController teamId={teamId} eventId={eventId} publicView/></main>;}
