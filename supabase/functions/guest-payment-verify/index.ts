import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization, X-Client-Info, Apikey"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SECRET=Deno.env.get("PAYSTACK_SECRET_KEY")||"";
const BASE="https://api.paystack.co";

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders});
  if(!["GET","POST"].includes(req.method))return json({error:"Method not allowed"},405);
  try{
    const url=new URL(req.url);
    let reference=url.searchParams.get("reference")?.trim()||"";
    if(!reference&&req.method==="POST"){
      const body=await req.json().catch(()=>({}));
      reference=typeof body.reference==="string"?body.reference.trim():"";
    }
    if(!reference||!reference.startsWith("DRG_GUEST_"))return json({error:"Invalid guest payment reference"},400);

    const{data:order,error:orderError}=await db.from("guest_orders").select("id,product_id,product_name,buyer_email,total_amount,currency,status,payment_status,processed_at").eq("payment_reference",reference).maybeSingle();
    if(orderError||!order)return json({error:"Guest order not found"},404);
    if(order.processed_at&&order.payment_status==="success")return json({success:true,status:"success",idempotent:true,reference,guest_order_id:order.id,product_id:order.product_id,product_name:order.product_name,amount:Number(order.total_amount),currency:order.currency});
    if(Number(order.total_amount)===0&&order.payment_status==="success")return json({success:true,status:"success",idempotent:true,reference,guest_order_id:order.id,product_id:order.product_id,product_name:order.product_name,amount:0,currency:order.currency});
    if(!SECRET)return json({error:"Paystack is not configured"},503);

    const response=await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`,{headers:{Authorization:`Bearer ${SECRET}`}});
    const verified=await response.json().catch(()=>({}));
    if(!response.ok||!verified?.status||!verified?.data)return json({success:false,status:"failed",error:String(verified?.message||"Payment verification failed")},400);
    if(String(verified.data.reference||"")!==reference)return json({success:false,status:"failed",error:"Gateway reference mismatch"},409);

    const gatewayStatus=String(verified.data.status||"").toLowerCase();
    const amount=Number(verified.data.amount)/100;
    const currency=String(verified.data.currency||"").toUpperCase();
    const expectedAmount=Number(order.total_amount);
    const expectedCurrency=String(order.currency||"NGN").toUpperCase();

    if(gatewayStatus==="success"){
      if(!Number.isFinite(amount)||Math.abs(amount-expectedAmount)>0.01)return json({success:false,status:"failed",error:"Gateway amount does not match guest order"},409);
      if(currency!==expectedCurrency)return json({success:false,status:"failed",error:"Gateway currency does not match guest order"},409);
      const{data:result,error:processError}=await db.rpc("process_verified_guest_order",{p_reference:reference,p_amount:expectedAmount,p_currency:expectedCurrency,p_gateway_response:verified.data.gateway_response||null,p_paid_at:verified.data.paid_at||new Date().toISOString(),p_channel:verified.data.channel||null});
      if(processError){console.error("guest payment processing error",processError);return json({success:false,status:"processing_error",error:"Verified payment could not be finalized"},500);}
      return json({success:true,status:"success",reference,guest_order_id:order.id,product_id:order.product_id,product_name:order.product_name,amount:expectedAmount,currency:expectedCurrency,channel:verified.data.channel||null,result});
    }

    if(["failed","abandoned","reversed"].includes(gatewayStatus)){
      await db.from("guest_orders").update({payment_status:gatewayStatus,status:gatewayStatus==="reversed"?"payment_reversed":"payment_failed",gateway_response:verified.data.gateway_response||null}).eq("id",order.id).is("processed_at",null);
      return json({success:false,status:gatewayStatus,reference,error:verified.data.gateway_response||`Payment ${gatewayStatus}`});
    }
    await db.from("guest_orders").update({payment_status:gatewayStatus||"pending",gateway_response:verified.data.gateway_response||null}).eq("id",order.id).is("processed_at",null);
    return json({success:false,status:gatewayStatus||"pending",reference,message:"Payment is still processing"});
  }catch(error){
    console.error("guest-payment-verify error",error);
    return json({error:error instanceof Error?error.message:"Guest payment verification failed"},500);
  }
});
