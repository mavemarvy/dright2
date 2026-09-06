import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization, X-Client-Info, Apikey"};
const SECRET=Deno.env.get("PAYSTACK_SECRET_KEY")||"";const BASE="https://api.paystack.co";const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response(null,{status:200,headers:corsHeaders});try{
 const auth=req.headers.get("Authorization");if(!auth)return json({error:"Missing auth"},401);const token=auth.replace("Bearer ","");const {createClient}=await import("npm:@supabase/supabase-js@2");const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);const {data:{user}}=await db.auth.getUser(token);if(!user)return json({error:"Unauthorized"},401);
 const url=new URL(req.url);let reference=url.searchParams.get("reference");if(!reference){try{reference=(await req.json()).reference}catch{}}if(!reference)return json({error:"Missing reference"},400);
 const {data:tx,error}=await db.from("paystack_transactions").select("*").eq("reference",reference).maybeSingle();if(error)return json({error:"DB error"},500);if(!tx)return json({error:"Transaction not found"},404);
 if(tx.status==="success"&&tx.processed_at)return json({success:true,status:"success",already_verified:true,idempotent:true,amount:Number(tx.amount),purpose:tx.purpose,channel:tx.channel});
 if(reference.startsWith("free_"))return json({success:true,status:"success",amount:0,purpose:"free_order"});
 if(!SECRET)return json({error:"Paystack not configured"},503);
 const response=await fetch(`${BASE}/transaction/verify/${reference}`,{headers:{Authorization:`Bearer ${SECRET}`}});const verified=await response.json();if(!verified.status)return json({success:false,status:"failed",message:verified.message||"Verification failed"},400);
 const gatewayStatus=verified.data?.status;
 if(gatewayStatus==="success"){
  const amount=Number(verified.data.amount)/100;await db.from("paystack_transactions").update({status:"success",paystack_reference:verified.data.reference,gateway_response:verified.data.gateway_response,paid_at:verified.data.paid_at,channel:verified.data.channel,updated_at:new Date().toISOString()}).eq("reference",reference);
  const {data:result,error:rpcError}=await db.rpc("process_paystack_payment",{p_reference:reference,p_user_id:tx.user_id,p_amount:amount,p_purpose:tx.purpose,p_reference_id:tx.reference_id,p_metadata:tx.metadata});if(rpcError)return json({error:"Payment processing failed"},500);await db.from("paystack_transactions").update({processed_at:new Date().toISOString()}).eq("reference",reference);
  if(result?.idempotent!==true)await db.from("notifications").insert({user_id:tx.user_id,notification_type:"payment_success",title:"Payment Successful",message:`Your payment of ${amount.toLocaleString()} was successful. Reference: ${reference}`,priority:"high",metadata:{reference,amount,purpose:tx.purpose,channel:verified.data.channel}}).catch(()=>{});
  return json({success:true,status:"success",amount,purpose:tx.purpose,channel:verified.data.channel,reference});
 }
 if(gatewayStatus==="reversed"){
  const amount=Number(verified.data.amount)/100;const {data:result,error}=await db.rpc("process_paystack_refund_event",{p_transaction_reference:reference,p_gateway_reference:`reversal:${reference}`,p_amount:amount,p_currency:verified.data.currency||tx.currency||"NGN",p_status:"reversed",p_reason:verified.data.gateway_response||"Paystack transaction reversed"});
  if(error)return json({error:"Reversal processing failed"},500);if(result?.success===false)return json({error:result.error||"Reversal processing failed"},500);
  return json({success:false,status:"reversed",reversal_processed:true,message:verified.data.gateway_response||"Payment reversed"});
 }
 if(["failed","abandoned"].includes(gatewayStatus)){await db.from("paystack_transactions").update({status:gatewayStatus,gateway_response:verified.data.gateway_response,updated_at:new Date().toISOString()}).eq("reference",reference);return json({success:false,status:gatewayStatus,message:verified.data.gateway_response||`Payment ${gatewayStatus}`});}
 return json({success:false,status:gatewayStatus,message:"Payment is still being processed"});
}catch(error){return json({error:error instanceof Error?error.message:"Internal error"},500)}});