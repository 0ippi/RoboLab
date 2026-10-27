// RoboLabin maksujen webhook (Supabase Edge Function). Stripe kutsuu tätä, kun maksu tai tilaus muuttuu,
// ja funktio päivittää public.subscriptions-taulun (vain tämä funktio ja ylläpitäjä voivat kirjoittaa sinne).
//
// Käyttöönotto: docs/maksut-ohje.md. Ympäristömuuttujat (Supabase → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY      Stripen salainen avain (sk_live_… / sk_test_…)
//   STRIPE_WEBHOOK_SECRET  webhookin allekirjoitusavain (whsec_…)
//   PRICE_PLANS            JSON: Stripen hinta-id → taso, esim. {"price_123":"pro","price_456":"education","price_789":"seats"}
//   SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY ovat Supabasessa valmiina.
// HUOM: tätä ei ole testattu oikeaa Stripe-tiliä vasten.
import Stripe from "npm:stripe@14.25.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { httpClient: Stripe.createFetchHttpClient() });
const crypto = Stripe.createSubtleCryptoProvider();
const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
const PRICE_PLANS: Record<string, string> = JSON.parse(Deno.env.get("PRICE_PLANS") ?? "{}");
const RANK: Record<string, number> = { free: 0, education: 1, teacher: 2, pro: 3 };
const GRACE_MS = 3 * 24 * 3600 * 1000; // maksun uusimiselle muutama päivä pelivaraa

const iso = (ms: number) => new Date(ms).toISOString();

async function current(userId: string) {
  const { data } = await db.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  return data;
}

// Taso voimaan: korkeampi taso voittaa, jos vanha on yhä voimassa
async function grantPlan(userId: string, plan: string, validUntil: string, extra: Record<string, unknown>) {
  const cur = await current(userId);
  const curValid = cur && (!cur.valid_until || Date.parse(cur.valid_until) > Date.now());
  if (curValid && RANK[cur.plan] > RANK[plan]) return; // ei alenneta voimassa olevaa korkeampaa tasoa
  await db.from("subscriptions").upsert({ user_id: userId, plan, valid_until: validUntil, source: "stripe", seats: cur?.seats ?? 0, updated_at: new Date().toISOString(), ...extra });
}

async function addSeats(userId: string, qty: number) {
  const cur = await current(userId);
  await db.from("subscriptions").upsert({
    user_id: userId, plan: cur?.plan ?? "free", valid_until: cur?.valid_until ?? null, source: cur?.source ?? "stripe",
    seats: (cur?.seats ?? 0) + qty, updated_at: new Date().toISOString(),
  });
}

async function onCheckout(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id;
  if (!userId) { console.warn("checkout ilman client_reference_id:tä", session.id); return; }
  const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 20 });
  for (const item of items.data) {
    const kind = PRICE_PLANS[item.price?.id ?? ""];
    if (!kind) { console.warn("tuntematon hinta", item.price?.id); continue; }
    if (kind === "seats") { await addSeats(userId, item.quantity ?? 1); continue; }
    if (session.mode === "subscription" && session.subscription) {
      const sub = await stripe.subscriptions.retrieve(String(session.subscription));
      await grantPlan(userId, kind, iso(sub.current_period_end * 1000 + GRACE_MS),
        { stripe_customer: String(session.customer ?? ""), stripe_subscription: sub.id });
    } else {
      // Kertamaksu (esim. vuosi laskulla): voimassa vuoden
      await grantPlan(userId, kind, iso(Date.now() + 365 * 24 * 3600 * 1000), { stripe_customer: String(session.customer ?? "") });
    }
  }
}

async function onSubscription(sub: Stripe.Subscription, deleted: boolean) {
  const { data: row } = await db.from("subscriptions").select("user_id").eq("stripe_subscription", sub.id).maybeSingle();
  if (!row) return;
  const until = deleted ? new Date().toISOString() : iso(sub.current_period_end * 1000 + (["active", "trialing"].includes(sub.status) ? GRACE_MS : 0));
  await db.from("subscriptions").update({ valid_until: until, updated_at: new Date().toISOString() }).eq("user_id", row.user_id);
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig ?? "", Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "", undefined, crypto);
  } catch (err) {
    return new Response(`Webhook-allekirjoitus ei kelpaa: ${(err as Error).message}`, { status: 400 });
  }
  try {
    if (event.type === "checkout.session.completed") await onCheckout(event.data.object as Stripe.Checkout.Session);
    else if (event.type === "customer.subscription.updated") await onSubscription(event.data.object as Stripe.Subscription, false);
    else if (event.type === "customer.subscription.deleted") await onSubscription(event.data.object as Stripe.Subscription, true);
  } catch (err) {
    console.error(err);
    return new Response("virhe", { status: 500 }); // Stripe yrittää uudelleen
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
