/**
 * Tipos do banco mantidos manualmente para o scaffold.
 * Substitua por `supabase gen types typescript --local` quando o schema estabilizar
 * (script `pnpm gen:types`). Mantenha em sincronia com supabase/migrations/.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<{
        id: string;
        role: "b2c" | "b2b" | "admin";
        display_name: string;
        phone_e164: string | null;
        document_type: "cpf" | "cnpj";
        document_number: string | null;
        asaas_customer_id: string | null;
        created_at: string;
        updated_at: string;
      }>;
      plans: Table<{
        code: string;
        name: string;
        price_cents: number;
        monthly_credits: number;
        active: boolean;
        created_at: string;
      }>;
      workspaces: Table<{
        id: string;
        owner_id: string;
        name: string;
        plan_code: string;
        created_at: string;
      }>;
      workspace_members: Table<{
        workspace_id: string;
        profile_id: string;
        member_role: "owner" | "planner" | "viewer";
        created_at: string;
      }>;
      events: Table<{
        id: string;
        owner_profile_id: string;
        workspace_id: string | null;
        title: string;
        event_type: string;
        event_date: string;
        region_code: string;
        guest_count: number;
        status: "draft" | "awaiting_payment" | "active" | "completed" | "canceled";
        city: string | null;
        interview_answers: Json | null;
        interview_completed_at: string | null;
        discovery_started_at: string | null;
        discovery_ends_at: string | null;
        discovery_status: "running" | "completed" | "paused" | null;
        collection_ended_at: string | null;
        quotes_delivered_at: string | null;
        created_at: string;
      }>;
      event_requirements: Table<{
        id: string;
        event_id: string;
        catalog_version: string;
        category: string;
        item_code: string;
        label: string;
        unit: "por_pessoa" | "por_hora" | "unidade" | "pacote";
        quantity: number;
        mandatory: boolean;
        notes: string | null;
        selected: boolean;
        created_at: string;
        updated_at: string;
      }>;
      event_tickets: Table<{
        id: string;
        event_id: string;
        status: "pending" | "active" | "refunded";
        payment_id: string | null;
        activated_at: string | null;
        created_at: string;
      }>;
      quotations: Table<{
        id: string;
        event_id: string;
        category: string;
        vendor_name: string;
        vendor_contact: string | null;
        amount_cents: number;
        status: "draft" | "sent" | "confirmed" | "declined" | "expired";
        engine_version: string;
        prospect_id: string | null;
        supplier_id: string | null;
        raw_text: string | null;
        extraction: Json | null;
        confidence: number | null;
        extraction_provider: "deepseek" | "nim" | "grok" | "contingency" | null;
        fees_cents: number;
        needs_followup: boolean;
        followup_count: number;
        updated_at: string;
        created_at: string;
      }>;
      budget_snapshots: Table<{
        id: string;
        event_id: string;
        engine_version: string;
        total_cents: number;
        breakdown: Json;
        created_at: string;
      }>;
      payments: Table<{
        id: string;
        profile_id: string;
        purpose: "event_ticket" | "credit_topup" | "subscription_invoice";
        event_id: string | null;
        asaas_payment_id: string;
        billing_type: "PIX" | "CREDIT_CARD";
        amount_cents: number;
        status:
          | "pending"
          | "paid"
          | "confirmed"
          | "overdue"
          | "refunded"
          | "risk_review"
          | "chargeback";
        asaas_fee_cents: number | null;
        net_cents: number | null;
        credits_granted: number | null;
        workspace_id: string | null;
        coupon_code: string | null;
        discount_cents: number;
        created_at: string;
        confirmed_at: string | null;
        refunded_at: string | null;
      }>;
      subscriptions: Table<{
        id: string;
        workspace_id: string;
        plan_code: string;
        asaas_subscription_id: string;
        status: "pending" | "active" | "overdue" | "canceled";
        current_period_start: string | null;
        current_period_end: string | null;
      }>;
      webhook_events: Table<{
        id: string;
        source: "asaas" | "evolution";
        external_event_id: string;
        payload: Json;
        status: "received" | "processing" | "processed" | "failed";
        attempts: number;
        received_at: string;
        processed_at: string | null;
        last_error: string | null;
      }>;
      credit_ledger: Table<{
        id: number;
        workspace_id: string;
        entry_type: "grant" | "topup" | "consume" | "refund" | "expire" | "adjust";
        amount_cents: number;
        balance_after_cents: number;
        expires_at: string | null;
        source_payment_id: string | null;
        source_subscription_id: string | null;
        event_id: string | null;
        idempotency_key: string;
        note: string | null;
        created_at: string;
      }>;
      whatsapp_messages: Table<{
        id: string;
        workspace_id: string | null;
        event_id: string | null;
        direction: "outbound" | "inbound";
        template: string;
        to_number_e164: string;
        body: string;
        status:
          | "pending"
          | "queued"
          | "sent"
          | "delivered"
          | "read"
          | "failed"
          | "canceled";
        idempotency_key: string;
        external_message_id: string | null;
        scheduled_for: string | null;
        sent_at: string | null;
        delivered_at: string | null;
        read_at: string | null;
        failed_at: string | null;
        error: string | null;
        prospect_id: string | null;
        created_at: string;
      }>;
      system_events: Table<{
        id: string;
        type: string;
        occurred_at: string;
        actor_type: "user" | "system" | "webhook" | "admin";
        actor_id: string | null;
        aggregate_type: string;
        aggregate_id: string;
        payload: Json;
        correlation_id: string;
        source: "app" | "worker" | "webhook";
        schema_version: number;
      }>;
      coupons: Table<{
        id: string;
        code: string;
        description: string | null;
        discount_type: "percent" | "fixed_cents";
        value: number;
        active: boolean;
        expires_at: string | null;
        max_redemptions: number | null;
        redemptions: number;
        created_at: string;
      }>;
      whatsapp_instances: Table<{
        id: string;
        profile_id: string;
        instance_name: string;
        status: "connecting" | "connected" | "active" | "draining" | "disconnected" | "paused";
        credentials_encrypted: string | null;
        last_checked_at: string | null;
        event_id: string | null;
        collection_window_minutes: number | null;
        activated_at: string | null;
        drain_at: string | null;
        disconnected_at: string | null;
        number_mode: "dedicated" | "personal" | null;
        created_at: string;
      }>;
      notifications: Table<{
        id: string;
        profile_id: string;
        event_id: string | null;
        type: "quotations_ready";
        payload: Json;
        idempotency_key: string;
        email_sent_at: string | null;
        read_at: string | null;
        created_at: string;
      }>;
      vendor_prospects: Table<{
        id: string;
        event_id: string;
        workspace_id: string | null;
        vendor_name: string;
        vendor_category: string;
        phone_e164: string;
        status: "pending" | "sent" | "replied" | "opt_out" | "failed";
        last_message_at: string | null;
        opt_out_at: string | null;
        supplier_id: string | null;
        source: "manual" | "auto" | "ingest";
        source_url: string | null;
        dry_run: boolean;
        created_at: string;
      }>;
      suppliers: Table<{
        id: string;
        name: string;
        category: string;
        phone_e164: string | null;
        whatsapp_verified: boolean | null;
        website_url: string | null;
        source_url: string;
        source_provider: string;
        external_id: string | null;
        city: string | null;
        region_code: string | null;
        opt_out_at: string | null;
        last_contacted_at: string | null;
        first_seen_at: string;
        last_seen_at: string;
      }>;
      supplier_discovery_runs: Table<{
        id: string;
        event_id: string;
        provider: string;
        category: string;
        round: number;
        found: number;
        inserted: number;
        enqueued: number;
        status: "ok" | "error" | "skipped";
        error: string | null;
        created_at: string;
      }>;
      llm_usage_events: Table<{
        id: string;
        provider: "nim" | "grok" | "deepseek";
        task: string;
        input_tokens: number;
        output_tokens: number;
        cost_micro_usd: number;
        outcome: "ok" | "invalid" | "low_confidence" | "error";
        event_id: string | null;
        profile_id: string | null;
        reason: string | null;
        model: string | null;
        cache_hit_tokens: number;
        peak: boolean | null;
        fx_brl_per_usd_micro: number | null;
        cost_brl_cents: number | null;
        created_at: string;
      }>;
      cost_entries: Table<{
        id: string;
        occurred_at: string;
        provider: "deepseek" | "xai" | "nim" | "search" | "fetch" | "whatsapp" | "asaas" | "vps" | "supabase" | "domain" | "other";
        kind: "variable" | "fixed";
        reason: string;
        event_id: string | null;
        workspace_id: string | null;
        profile_id: string | null;
        quantity: number;
        unit_price_micro_usd: number;
        cost_micro_usd: number;
        fx_brl_per_usd_micro: number;
        cost_brl_cents: number;
        note: string | null;
        created_by: string | null;
        created_at: string;
      }>;
      pricing_rates: Table<{
        key: string;
        micro_usd: number;
        unit: "per_1m_tokens" | "per_1k_requests" | "per_unit";
        updated_by: string | null;
        updated_at: string;
      }>;
      fx_rates: Table<{
        rate_date: string;
        brl_per_usd_micro: number;
        source: string;
        created_at: string;
      }>;
      consents: Table<{
        id: string;
        profile_id: string | null;
        phone_e164: string;
        channel: "whatsapp";
        status: "opted_in" | "opted_out";
        source: string;
        updated_at: string;
      }>;
      testimonial_invites: Table<{
        id: string;
        token: string;
        event_id: string;
        profile_id: string;
        expires_at: string;
        used_at: string | null;
        created_at: string;
      }>;
      testimonials: Table<{
        id: string;
        invite_id: string | null;
        profile_id: string | null;
        event_id: string | null;
        author_name: string;
        city: string | null;
        event_context: string | null;
        audience: "b2c" | "b2b";
        quote: string;
        outcome: string | null;
        consent_given: boolean;
        consent_text_version: string;
        consent_at: string;
        status: "pending" | "approved" | "rejected";
        published: boolean;
        published_at: string | null;
        created_at: string;
      }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      process_payment_webhook: {
        Args: { p_webhook_event_id: string };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
