import{NextRequest}from'next/server';import{todoHTTP}from'@/lib/schedule-todos/http';
export const GET=(req:NextRequest)=>todoHTTP(req);export const POST=(req:NextRequest)=>todoHTTP(req);
