/**
 * Tipos do banco mantidos manualmente para o scaffold.
 * Substitua por `supabase gen types typescript --local` quando o schema estabilizar
 * (script `pnpm gen:types`). Mantenha em sincronia com supabase/migrations/.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type ProcessStageDb =
  "briefing" | "discovery" | "prospecting" | "quote_collection" | "proposal" | "confirmation";

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      terms_acceptances: Table<{
        id: number;
        profile_id: string;
        terms_version: string;
        context: "signup" | "checkout";
        accepted_at: string;
      }>;
      profiles: Table<{
        id: string;
        role: "b2c" | "b2b" | "admin";
        display_name: string;
        email: string | null;
        phone_e164: string | null;
        contact_whatsapp_e164: string | null;
        instagram_handle: string | null;
        document_type: "cpf" | "cnpj";
        document_number: string | null;
        asaas_customer_id: string | null;
        created_at: string;
        updated_at: string;
        whatsapp_channel: "cloud" | "evolution" | null;
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
        city_uf: string | null;
        city_ibge_code: number | null;
        search_city_codes: number[] | null;
        interview_answers: Json | null;
        interview_completed_at: string | null;
        discovery_started_at: string | null;
        discovery_ends_at: string | null;
        discovery_status: "running" | "completed" | "paused" | null;
        collection_ended_at: string | null;
        quotes_delivered_at: string | null;
        search_start_date: string | null;
        created_at: string;
        whatsapp_channel: "cloud" | "evolution" | null;
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
        status: "draft" | "sent" | "confirmed" | "declined" | "expired" | "repassado";
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
        repassado_at: string | null;
        updated_at: string;
        created_at: string;
      }>;
      contact_handoff_consents: Table<{
        id: string;
        event_id: string;
        quotation_id: string;
        supplier_id: string | null;
        profile_id: string;
        consent_text: string;
        consent_version: string;
        accepted_at: string;
        delivery_status: "consentido" | "repassado" | "link" | "canal_fechado" | "indisponivel";
        delivery_channel: "instagram" | "messenger" | "email" | "link" | null;
        delivered_at: string | null;
        fallback_url: string | null;
        created_at: string;
        updated_at: string;
      }>;
      quotation_choices: Table<{
        id: string;
        event_id: string;
        quotation_id: string;
        option_index: number;
        option_snapshot: Json;
        chosen_by_profile_id: string | null;
        created_at: string;
        updated_at: string;
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
        billing_type: "PIX" | "CREDIT_CARD" | "COURTESY";
        amount_cents: number;
        status:
          | "pending"
          | "paid"
          | "confirmed"
          | "overdue"
          | "refunded"
          | "risk_review"
          | "chargeback"
          | "canceled";
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
        source: "asaas" | "evolution" | "whatsapp_cloud";
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
        status: "pending" | "queued" | "sent" | "delivered" | "read" | "failed" | "canceled";
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
        channel: "cloud" | "evolution" | null;
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
      welcome_offers: Table<{
        id: string;
        code: string;
        ip_hash: string;
        device_hash: string;
        profile_id: string | null;
        source: "new_ip" | "convite" | "promo";
        created_at: string;
        expires_at: string;
        bound_at: string | null;
        reserved_event_id: string | null;
        redeemed_at: string | null;
        payment_id: string | null;
        visit_hash: string | null;
        forfeited_at: string | null;
      }>;
      lucky_coupons: Table<{
        id: string;
        code: string;
        ip_hash: string;
        device_hash: string;
        profile_id: string | null;
        percent: number;
        created_at: string;
        expires_at: string;
        redraw_at: string;
        superseded_at: string | null;
        reserved_event_id: string | null;
        redeemed_at: string | null;
        payment_id: string | null;
      }>;
      coupons: Table<{
        id: string;
        code: string;
        description: string | null;
        discount_type: "percent" | "fixed_cents" | "free";
        value: number;
        active: boolean;
        expires_at: string | null;
        max_redemptions: number | null;
        redemptions: number;
        created_at: string;
      }>;
      coupon_redemptions: Table<{
        id: string;
        coupon_id: string;
        profile_id: string;
        event_id: string | null;
        payment_id: string | null;
        status: "reserved" | "redeemed" | "released";
        created_at: string;
        updated_at: string;
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
        hidden_at: string | null;
        pending_reply: string | null;
        pending_reply_kind: "question" | "values" | "unavailable" | "other" | null;
        pending_reply_at: string | null;
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
        contact_email: string | null;
        city: string | null;
        region_code: string | null;
        inclui: string[];
        capacidade: number | null;
        tipo_espaco: string | null;
        opt_out_at: string | null;
        last_contacted_at: string | null;
        first_seen_at: string;
        last_seen_at: string;
        deleted_at?: string | null;
        deleted_by?: string | null;
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
      prospecting_posts: Table<{
        id: string;
        event_id: string;
        event_code: string;
        event_type: string;
        event_date: string;
        city: string | null;
        region: string | null;
        caption: string;
        image_url: string | null;
        image_params: Json;
        status: "draft" | "pending_approval" | "approved" | "published" | "failed";
        ig_media_id: string | null;
        error: string | null;
        published_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      supplier_conversations: Table<{
        id: string;
        event_id: string | null;
        supplier_id: string | null;
        channel: "instagram" | "messenger";
        external_user_id: string;
        ref: string | null;
        last_inbound_at: string | null;
        window_expires_at: string | null;
        window_kind: "standard_24h" | "ad_7d";
        status: "open" | "canal_fechado" | "opted_out";
        created_at: string;
        updated_at: string;
      }>;
      supplier_conversation_messages: Table<{
        id: string;
        conversation_id: string;
        direction: "in" | "out";
        body: string;
        moderated: boolean;
        external_id: string | null;
        author: "user" | "agent" | "system" | null;
        created_at: string;
      }>;
      supplier_options: Table<{
        id: string;
        supplier_id: string;
        name: string;
        description: string | null;
        price_cents: number | null;
        unit: "por_pessoa" | "por_hora" | "unidade" | "pacote";
        source_message_id: string | null;
        active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      supplier_selections: Table<{
        id: string;
        event_id: string;
        supplier_id: string;
        option_id: string | null;
        option_snapshot: Json;
        status:
          | "pendente"
          | "enviado_ao_fornecedor"
          | "aguardando_resposta"
          | "respondido"
          | "canal_fechado"
          | "indisponivel";
        chosen_by_profile_id: string | null;
        conversation_id: string | null;
        relayed_at: string | null;
        supplier_responded_at: string | null;
        created_at: string;
        updated_at: string;
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
        stage: ProcessStageDb | null;
        whatsapp_channel: "cloud" | "evolution" | null;
        created_at: string;
        deleted_at?: string | null;
        deleted_by?: string | null;
      }>;
      event_outcomes: Table<{
        event_id: string;
        closed_outside: boolean;
        closed_outside_at: string | null;
        closed_outside_stage: ProcessStageDb | null;
        whatsapp_channel: "cloud" | "evolution" | null;
        source: "admin" | "system";
        created_at: string;
        updated_at: string;
      }>;
      cost_entries: Table<{
        id: string;
        occurred_at: string;
        provider:
          | "deepseek"
          | "xai"
          | "nim"
          | "search"
          | "fetch"
          | "whatsapp"
          | "asaas"
          | "vps"
          | "supabase"
          | "domain"
          | "other"
          | "serper"
          | "google_places"
          | "resend"
          | "evolution";
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
        is_estimate: boolean | null;
        deleted_at: string | null;
        deleted_by: string | null;
        created_by: string | null;
        created_at: string;
        recurring?: boolean;
      }>;
      pricing_rates: Table<{
        key: string;
        micro_usd: number;
        unit: "per_1m_tokens" | "per_1k_requests" | "per_unit";
        updated_by: string | null;
        updated_at: string;
      }>;
      provider_balances: Table<{
        provider: string;
        label: string;
        source: "api" | "manual" | "budget";
        monthly_budget_brl_cents: number | null;
        balance_brl_cents: number | null;
        raw_currency: string | null;
        raw_balance: number | null;
        threshold_brl_cents: number;
        runway_alert_days: number;
        daily_burn_brl_cents: number | null;
        fetched_at: string | null;
        last_error: string | null;
        last_alert_at: string | null;
        note: string | null;
        updated_by: string | null;
        updated_at: string;
        renewal_date?: string | null;
        monthly_cost_brl_cents?: number | null;
        renewal_alerted_for?: string | null;
      }>;
      finance_alerts: Table<{
        id: string;
        provider: string;
        kind: "low_balance" | "low_runway" | "fetch_error" | "meta_token";
        balance_brl_cents: number | null;
        runway_days: number | null;
        emailed: boolean;
        created_at: string;
        deleted_at: string | null;
        deleted_by: string | null;
      }>;
      meta_token_status: Table<{
        id: string;
        checked_at: string;
        is_valid: boolean;
        expires_at: string | null;
        scopes: string[];
        missing_scopes: string[];
        optional_missing: string[];
        error: string | null;
        last_alert_at: string | null;
        created_at: string;
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
      support_tickets: Table<{
        id: string;
        user_id: string | null;
        email: string | null;
        type: "sugestao" | "reclamacao" | "elogio" | "problema";
        subject: string;
        message: string;
        event_id: string | null;
        page_url: string | null;
        user_agent: string | null;
        attachment_path: string | null;
        status: "aberto" | "em_andamento" | "resolvido" | "fechado";
        priority: "baixa" | "normal" | "alta" | "urgente";
        created_at: string;
        updated_at: string;
        closed_at?: string | null;
        closed_by?: string | null;
        deleted_at?: string | null;
        deleted_by?: string | null;
        edited_at?: string | null;
      }>;
      support_ticket_edits: Table<{
        id: string;
        ticket_id: string;
        edited_by: string | null;
        old_subject: string;
        old_message: string;
        edited_at: string;
      }>;
      admin_audit_log: Table<{
        id: string;
        admin_id: string | null;
        action: string;
        target_table: string;
        target_ids: string[];
        details: Json;
        created_at: string;
      }>;
      support_ticket_messages: Table<{
        id: string;
        ticket_id: string;
        author_role: "user" | "admin";
        author_id: string | null;
        body: string;
        created_at: string;
      }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      support_ticket_owner_edit: {
        Args: { p_ticket_id: string; p_subject: string; p_message: string };
        Returns: boolean;
      };
      support_ticket_owner_delete: { Args: { p_ticket_id: string }; Returns: boolean };
      user_offer_current: {
        Args: { p_profile_id: string };
        Returns: {
          id: string;
          kind: "welcome" | "personal";
          code: string;
          avulso_off_cents: number;
          pack_percent: number;
          created_at: string;
          expires_at: string;
          status: "active" | "used" | "expired";
          server_now: string;
        }[];
      };
      user_offer_start_welcome: { Args: { p_profile_id: string }; Returns: undefined };
      auth_user_has_password: { Args: { p_user_id: string }; Returns: boolean };
      user_offer_request: {
        Args: { p_profile_id: string; p_cooldown_days: number };
        Returns: {
          status: "active" | "created" | "cooldown";
          offer_id: string | null;
          next_at: string | null;
        }[];
      };
      user_offer_claim: { Args: { p_profile_id: string; p_offer_id: string }; Returns: boolean };
      user_offer_attach: { Args: { p_offer_id: string; p_payment_id: string }; Returns: undefined };
      user_offer_release: { Args: { p_offer_id: string }; Returns: undefined };
      reserve_coupon: {
        Args: { p_code: string; p_profile_id: string; p_event_id: string | null };
        Returns: {
          status: "ok" | "invalid" | "already_used" | "exhausted";
          reservation_id: string | null;
          discount_type: "percent" | "fixed_cents" | "free" | null;
          value: number | null;
        }[];
      };
      attach_coupon_reservation: {
        Args: { p_reservation_id: string; p_payment_id: string };
        Returns: undefined;
      };
      redeem_courtesy_coupon: {
        Args: { p_code: string; p_profile_id: string; p_event_id: string };
        Returns: string;
      };
      support_rate_hit: {
        Args: { p_key_hash: string; p_limit: number };
        Returns: number;
      };
      welcome_offer_lookup: {
        Args: {
          p_ip_hash: string;
          p_device_hash: string;
          p_profile_id: string | null;
          p_source: string;
          p_claim: boolean;
        };
        Returns: {
          status: "active" | "expired" | "redeemed" | "ineligible" | "none";
          code: string | null;
          expires_at: string | null;
          server_now: string;
          created: boolean;
        }[];
      };
      welcome_offer_reserve: {
        Args: { p_profile_id: string; p_event_id: string };
        Returns: { code: string; expires_at: string }[];
      };
      welcome_offer_touch_visit: {
        Args: { p_device_hash: string; p_profile_id: string | null; p_visit_hash: string | null };
        Returns: string;
      };
      lucky_coupon_lookup: {
        Args: {
          p_ip_hash: string;
          p_device_hash: string;
          p_profile_id: string | null;
          p_percent: number | null;
          p_window_hours: number;
          p_validity_hours: number;
        };
        Returns: {
          status: "available" | "active" | "expired" | "redeemed" | "ineligible";
          code: string | null;
          percent: number | null;
          expires_at: string | null;
          redraw_at: string | null;
          server_now: string;
          created: boolean;
        }[];
      };
      lucky_coupon_reserve: {
        Args: { p_profile_id: string; p_event_id: string };
        Returns: { code: string; percent: number; expires_at: string }[];
      };
      welcome_offer_recent_redemptions: {
        Args: Record<string, never>;
        Returns: number;
      };
      process_payment_webhook: {
        Args: { p_webhook_event_id: string };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
