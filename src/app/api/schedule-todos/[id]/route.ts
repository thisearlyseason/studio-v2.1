import{NextRequest}from'next/server';import{todoHTTP}from'@/lib/schedule-todos/http';
type Context={params:Promise<{id:string}>};export async function PATCH(req:NextRequest,{params}:Context){return todoHTTP(req,(await params).id)}export async function DELETE(req:NextRequest,{params}:Context){return todoHTTP(req,(await params).id)}
