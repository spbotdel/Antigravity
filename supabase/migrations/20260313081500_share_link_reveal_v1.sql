alter table public.tree_share_links
  add column if not exists token_ciphertext text;
