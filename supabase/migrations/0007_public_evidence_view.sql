-- 0007_public_evidence_view.sql
-- Public transparency surface for sources.
--
-- The evidence table is staff-only because it can carry internal notes. This
-- view exposes only the citation columns, and only for published profiles, so
-- a visitor can see where each fact came from and when it was retrieved.

create view public.agent_public_evidence as
select
  e.subject_id   as agent_id,
  e.field_name,
  e.field_value,
  e.source_url,
  e.retrieved_at,
  e.verification,
  s.name         as source_name
from public.evidence e
left join public.research_source s on s.id = e.source_id
join public.agent a
  on a.id = e.subject_id
 and a.status = 'published'
where e.subject = 'agent';

comment on view public.agent_public_evidence is
  'Citation-only projection of evidence for published agents. Internal notes, confidence scores and the recording user are deliberately excluded.';

grant select on public.agent_public_evidence to anon, authenticated;
