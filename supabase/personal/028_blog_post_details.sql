begin;

alter table public.ops_blog_keywords
  add column if not exists board text check (board in ('블러셔 진열대', '썼어유', '보통의날')),
  add column if not exists sub_keyword text not null default '' check (char_length(sub_keyword) <= 200),
  add column if not exists summary text not null default '' check (char_length(summary) <= 1000),
  add column if not exists is_draft boolean not null default false;

grant insert (board, sub_keyword, summary, is_draft),
      update (keyword, board, sub_keyword, summary, is_draft)
  on public.ops_blog_keywords to authenticated;

notify pgrst, 'reload schema';
commit;
