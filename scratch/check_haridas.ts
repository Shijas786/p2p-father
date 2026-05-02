import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || ""
);

async function check() {
  const { data: user } = await supabase
    .from("users")
    .select("*")
    .ilike("username", "%Haridas007%")
    .single();

  const { data: trades } = await supabase
    .from("trades")
    .select("*")
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);

  console.log("Detailed Trade Info:", trades);
}

check().catch(console.error);
