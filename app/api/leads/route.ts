import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export async function POST(req: Request) {
 try {
  const body = await req.json();
  const required = ["name","phone","email","zip","property_type","service","timing"];
  for (const key of required) if (!String(body[key] ?? "").trim()) return NextResponse.json({error:`Missing required field: ${key}`},{status:400});
  if (!/^[0-9]{5}$/.test(String(body.zip))) return NextResponse.json({error:"Enter a valid 5-digit ZIP code."},{status:400});
  if (body.consent !== "yes") return NextResponse.json({error:"Consent is required to submit."},{status:400});
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({error:"The lead form is built, but the database is not connected yet. Please try again shortly."},{status:503});
  const supabase = createClient(url,key,{auth:{persistSession:false}});
  const {error} = await supabase.from("leads").insert({name:String(body.name).trim(),phone:String(body.phone).trim(),email:String(body.email).trim(),zip:String(body.zip),property_type:String(body.property_type),service:String(body.service),timing:String(body.timing),details:String(body.details ?? "").trim(),consent:true,status:"new"});
  if(error) return NextResponse.json({error:"We couldn't save your request. Please try again."},{status:500});
  return NextResponse.json({ok:true});
 } catch { return NextResponse.json({error:"Invalid request."},{status:400}); }
}