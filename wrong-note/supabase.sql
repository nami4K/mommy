-- 다시봄 오답노트: 가족 저장 공간(Supabase) 만들기
-- Supabase 대시보드 → SQL Editor → New query → 이 파일 전체를 붙여 넣고 Run. 한 번만 하면 됩니다.
-- 여러 번 실행해도 괜찮아요(이미 있으면 건너뜀).
--
-- 표는 아무도 직접 읽거나 쓸 수 없고(행 수준 보안, 정책 없음),
-- 가족 코드를 확인하는 wn_ 함수로만 주고받습니다. Claude의 정리 작업은 Secret 키로 들어옵니다.

create table if not exists wn_family (
  id uuid primary key default gen_random_uuid(),
  code_hash text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists wn_docs (
  family_id uuid not null references wn_family(id) on delete cascade,
  kind text not null,
  id text not null,
  data jsonb,
  ts bigint not null default 0,          -- 기기에서 고친 시각(밀리초). 더 나중 것이 이김
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (family_id, kind, id)
);
create index if not exists wn_docs_updated on wn_docs (family_id, updated_at);

create table if not exists wn_images (
  family_id uuid not null references wn_family(id) on delete cascade,
  id text not null,
  mime text not null,
  b64 text not null,
  created_at timestamptz not null default now(),
  primary key (family_id, id)
);

alter table wn_family enable row level security;
alter table wn_docs enable row level security;
alter table wn_images enable row level security;

create or replace function wn_hash(p_code text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(upper(trim(p_code)), 'UTF8')), 'hex')
$$;

create or replace function wn_fid(p_code text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from wn_family where code_hash = wn_hash(p_code)
$$;

-- 가족 코드가 맞는지
create or replace function wn_join(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select wn_fid(p_code) is not null
$$;

-- 처음 한 번만: 가족 만들기 (이미 가족이 있으면 false)
create or replace function wn_create_family(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from wn_family) then return false; end if;
  if length(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) < 8 then return false; end if;
  insert into wn_family(code_hash) values (wn_hash(p_code));
  return true;
end $$;

-- 받기: p_since 뒤에 바뀐 문서
create or replace function wn_pull(p_code text, p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f uuid := wn_fid(p_code);
begin
  if f is null then raise exception 'bad code' using errcode = '28000'; end if;
  return jsonb_build_object('docs', coalesce((
    select jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'data', data, 'ts', ts, 'deleted', deleted, 'at', updated_at) order by updated_at)
    from wn_docs where family_id = f and updated_at > coalesce(p_since, '-infinity'::timestamptz)), '[]'::jsonb));
end $$;

-- 보내기: 같은 문서는 ts가 더 큰(나중에 고친) 쪽이 남음
create or replace function wn_push(p_code text, p_docs jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare f uuid := wn_fid(p_code); d jsonb; n integer := 0;
begin
  if f is null then raise exception 'bad code' using errcode = '28000'; end if;
  for d in select * from jsonb_array_elements(p_docs) loop
    insert into wn_docs(family_id, kind, id, data, ts, deleted, updated_at)
    values (f, d->>'kind', d->>'id', d->'data', coalesce((d->>'ts')::bigint, 0), coalesce((d->>'deleted')::boolean, false), clock_timestamp())
    on conflict (family_id, kind, id) do update
      set data = excluded.data, ts = excluded.ts, deleted = excluded.deleted, updated_at = clock_timestamp()
      where wn_docs.ts <= excluded.ts;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function wn_img_put(p_code text, p_id text, p_mime text, p_b64 text) returns boolean
language plpgsql security definer set search_path = public as $$
declare f uuid := wn_fid(p_code);
begin
  if f is null then raise exception 'bad code' using errcode = '28000'; end if;
  if length(p_b64) > 4000000 then raise exception 'too big'; end if;
  insert into wn_images(family_id, id, mime, b64) values (f, p_id, p_mime, p_b64) on conflict do nothing;
  return true;
end $$;

create or replace function wn_img_get(p_code text, p_ids text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f uuid := wn_fid(p_code);
begin
  if f is null then raise exception 'bad code' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'mime', mime, 'b64', b64)) from wn_images where family_id = f and id = any(p_ids)), '[]'::jsonb);
end $$;

create or replace function wn_img_del(p_code text, p_ids text[]) returns integer
language plpgsql security definer set search_path = public as $$
declare f uuid := wn_fid(p_code); n integer;
begin
  if f is null then raise exception 'bad code' using errcode = '28000'; end if;
  delete from wn_images where family_id = f and id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- 공개 키(anon)로는 위의 wn_ 함수만 부를 수 있게
revoke all on function wn_fid(text) from public, anon, authenticated;
revoke all on function wn_hash(text) from public, anon, authenticated;
grant execute on function wn_join(text), wn_create_family(text), wn_pull(text, timestamptz), wn_push(text, jsonb),
  wn_img_put(text, text, text, text), wn_img_get(text, text[]), wn_img_del(text, text[]) to anon, authenticated;
