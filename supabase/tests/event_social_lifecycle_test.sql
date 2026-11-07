-- pgTAP: 0083 event social lifecycle (from reviewed proposal; NOT RUN here).
begin;
create extension if not exists pgtap;
select plan(8);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a0900000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dono-social@teste.com',
   '', now(), '{}'::jsonb,
   '{"full_name":"Dono Social"}'::jsonb, now(), now());

insert into public.events
  (id, owner_profile_id, title, event_type, event_date, region_code, guest_count, status)
values
  ('a0901111-0000-4000-8000-000000000001', 'a0900000-0000-4000-8000-000000000001',
   'IG no JSON', 'casamento', '2026-11-01', 'SP', 10, 'active'),
  ('a0901111-0000-4000-8000-000000000002', 'a0900000-0000-4000-8000-000000000001',
   'FB na coluna', 'casamento', '2026-11-02', 'SP', 10, 'active'),
  ('a0901111-0000-4000-8000-000000000003', 'a0900000-0000-4000-8000-000000000001',
   'Manual removido', 'casamento', '2026-11-03', 'SP', 10, 'active');

insert into public.prospecting_posts
  (event_id, event_code, event_type, event_date, caption, image_url, status,
   ig_media_id, fb_post_id, error, image_params)
values
  ('a0901111-0000-4000-8000-000000000001', 'EVT-SOCIAL1', 'casamento', '2026-11-01',
   'teste', null, 'failed', null, null, null,
   '{"publication":{"instagram":{"kind":"published","id":"123"},"facebook":{"kind":"pending"}}}'::jsonb),
  ('a0901111-0000-4000-8000-000000000002', 'EVT-SOCIAL2', 'casamento', '2026-11-02',
   'teste', null, 'failed', null, 'page_9', null,
   '{"publication":{"instagram":{"kind":"pending"},"facebook":{"kind":"published","id":"page_9"}}}'::jsonb),
  ('a0901111-0000-4000-8000-000000000003', 'EVT-SOCIAL3', 'casamento', '2026-11-03',
   'teste', null, 'failed', null, null,
   'manual_removal_required:https://instagram.com/p/legacy',
   '{"publication":{"instagram":{"kind":"removed"},"facebook":{"kind":"removed"}}}'::jsonb);

insert into public.prospect_posts
  (id, event_id, caption, categories, day_index, status, ig_media_id, fb_post_id, publication)
values
  ('a0902222-0000-4000-8000-000000000001', 'a0901111-0000-4000-8000-000000000001',
   'isca uncertain', '{buffet}', 0, 'failed', null, null,
   '{"instagram":{"kind":"uncertain","reason":"timeout"},"facebook":{"kind":"pending"}}'::jsonb),
  ('a0902222-0000-4000-8000-000000000002', 'a0901111-0000-4000-8000-000000000002',
   'isca sem ref', '{buffet}', 1, 'failed', null, null,
   '{"instagram":{"kind":"removed"},"facebook":{"kind":"removed"}}'::jsonb);

-- Dispara o trigger real de encerramento.
update public.events
   set status = 'completed'
 where id in (
   'a0901111-0000-4000-8000-000000000001',
   'a0901111-0000-4000-8000-000000000002',
   'a0901111-0000-4000-8000-000000000003'
 );

select is((select count(*)::int from public.prospecting_posts where event_code = 'EVT-SOCIAL1'), 1, 'IG no JSON preservado');
select is((select count(*)::int from public.prospecting_posts where event_code = 'EVT-SOCIAL2'), 1, 'FB na coluna preservado');
select is((select count(*)::int from public.prospecting_posts where event_code = 'EVT-SOCIAL3'), 1, 'marcador manual legado preservado');
select is((select count(*)::int from public.prospect_posts where id = 'a0902222-0000-4000-8000-000000000001'), 1, 'isca uncertain preservada');
select is((select count(*)::int from public.prospect_posts where id = 'a0902222-0000-4000-8000-000000000002'), 0, 'isca sem refs sai');
select is((
  select count(*)::int from public.events
   where id in (
     'a0901111-0000-4000-8000-000000000001',
     'a0901111-0000-4000-8000-000000000002',
     'a0901111-0000-4000-8000-000000000003'
   )
     and closed_at is not null
), 3, 'trigger de encerramento rodou nos 3 fixtures');
select is(public.event_publication_has_refs(null, null, '{"instagram":{"kind":"uncertain","reason":"x"}}'::jsonb, null), true, 'uncertain é ref');
select is(public.event_publication_has_refs(null, null, '{"instagram":{"kind":"removed"},"facebook":{"kind":"pending"}}'::jsonb, 'manual_removal_required:https://x'), true, 'marker legado é ref');

select * from finish();
rollback;
